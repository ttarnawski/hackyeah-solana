export interface CreateAuctionInput {
  draftId: string;
}

export interface BidInput {
  listingAddress: string;
  amountLamports: string;
}

export interface AuctionTransaction {
  signature: string;
}

export interface AuctionProgramClient {
  createAuction(input: CreateAuctionInput): Promise<AuctionTransaction>;
  placeBid(input: BidInput): Promise<AuctionTransaction>;
  buyout(listingAddress: string): Promise<AuctionTransaction>;
  settleAuction(listingAddress: string): Promise<AuctionTransaction>;
  claimRefund(listingAddress: string): Promise<AuctionTransaction>;
}

export class AuctionProgramNotReadyError extends Error {
  constructor() {
    super(
      "Auction instructions are not available until the on-chain auction program and IDL are deployed.",
    );
    this.name = "AuctionProgramNotReadyError";
  }
}

export const auctionProgramClient: AuctionProgramClient = {
  async createAuction() {
    throw new AuctionProgramNotReadyError();
  },
  async placeBid() {
    throw new AuctionProgramNotReadyError();
  },
  async buyout() {
    throw new AuctionProgramNotReadyError();
  },
  async settleAuction() {
    throw new AuctionProgramNotReadyError();
  },
  async claimRefund() {
    throw new AuctionProgramNotReadyError();
  },
};
