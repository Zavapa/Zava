import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  rpc,
  Keypair,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  Address,
  xdr,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';

export interface ContractIds {
  savings: string;
  honk8w: string;
  honk12w: string;
  honk24w: string;
  verifier: string;
}

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  readonly server: rpc.Server;
  readonly networkPassphrase: string;
  readonly contracts: ContractIds;
  private readonly submitterSecret: string;

  constructor(private readonly config: ConfigService) {
    const rpcUrl = this.config.getOrThrow<string>('stellar.rpcUrl');
    this.networkPassphrase = this.config.getOrThrow<string>(
      'stellar.networkPassphrase',
    );
    this.contracts = this.config.getOrThrow<ContractIds>('stellar.contracts');
    this.submitterSecret = this.config.get<string>('stellar.submitterSecret') ?? '';
    this.server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  }

  hasSubmitter(): boolean {
    return this.submitterSecret.length > 0;
  }

  submitterKeypair(): Keypair {
    if (!this.submitterSecret) {
      throw new Error('STELLAR_SUBMITTER_SECRET not configured');
    }
    return Keypair.fromSecret(this.submitterSecret);
  }

  /**
   * Simulate a read-only contract call and return the parsed native value.
   */
  async readContract(
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
    sourceAccountId?: string,
  ): Promise<unknown> {
    const contract = new Contract(contractId);
    const source = sourceAccountId
      ? await this.server.getAccount(sourceAccountId)
      : await this.server.getAccount(this.placeholderAccount());

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`simulate(${method}) failed: ${sim.error}`);
    }
    const result = (sim as rpc.Api.SimulateTransactionSuccessResponse).result;
    if (!result) return null;
    return scValToNative(result.retval);
  }

  /**
   * Build, sign with submitter, simulate-prepare, and send a contract invocation.
   * Returns the transaction hash and (optionally) the returned native value.
   */
  async invokeContract(
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
  ): Promise<{ hash: string; returnValue: unknown }> {
    if (!this.hasSubmitter()) {
      throw new Error('No submitter configured');
    }
    const kp = this.submitterKeypair();
    const account = await this.server.getAccount(kp.publicKey());
    const contract = new Contract(contractId);

    let tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(60)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`simulate(${method}) failed: ${sim.error}`);
    }
    tx = rpc.assembleTransaction(tx, sim).build();
    tx.sign(kp);
    const sent = await this.server.sendTransaction(tx);
    if (sent.status === 'ERROR') {
      throw new Error(`sendTransaction failed: ${JSON.stringify(sent.errorResult)}`);
    }
    const final = await this.pollForResult(sent.hash);
    const retval = final.returnValue ? scValToNative(final.returnValue) : null;
    return { hash: sent.hash, returnValue: retval };
  }

  private async pollForResult(
    hash: string,
    timeoutMs = 30_000,
  ): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const r = await this.server.getTransaction(hash);
      if (r.status === 'SUCCESS') return r;
      if (r.status === 'FAILED') {
        throw new Error(`tx ${hash} failed`);
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
    throw new Error(`tx ${hash} timed out`);
  }

  private placeholderAccount(): string {
    // For simulations only. Any funded testnet account works.
    if (this.submitterSecret) return this.submitterKeypair().publicKey();
    return 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  }

  // ---------- Conversion helpers ----------

  addressScVal(addr: string): xdr.ScVal {
    return new Address(addr).toScVal();
  }

  bytesN32ScVal(hex: string): xdr.ScVal {
    return nativeToScVal(this.hexToBuffer(hex), { type: 'bytes' });
  }

  bytesScVal(bytes: Buffer): xdr.ScVal {
    return nativeToScVal(bytes, { type: 'bytes' });
  }

  u32ScVal(n: number): xdr.ScVal {
    return nativeToScVal(n, { type: 'u32' });
  }

  u64ScVal(n: bigint | number): xdr.ScVal {
    return nativeToScVal(BigInt(n), { type: 'u64' });
  }

  private hexToBuffer(hex: string): Buffer {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length !== 64) {
      throw new Error(`expected 32-byte hex string, got ${clean.length / 2} bytes`);
    }
    return Buffer.from(clean, 'hex');
  }

  static defaultNetworkPassphrase(): string {
    return Networks.TESTNET;
  }
}
