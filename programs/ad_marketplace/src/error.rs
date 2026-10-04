use anchor_lang::prelude::*;

#[error_code]
pub enum CustomError {
    #[msg("Supplier is not KYB verified.")]
    KybNotVerified,
    #[msg("KYB ID must be a 7-digit integer (1000000 - 9999999).")]
    InvalidKybId,
    #[msg("Bid must be strictly higher than current top bid.")]
    BidTooLow,
    #[msg("Ad URL exceeds 128 bytes limit.")]
    UrlTooLong,
    #[msg("Passed account does not match on-chain previous winner.")]
    InvalidPreviousWinner,
    #[msg("No settled funds available for withdrawal.")]
    NoFundsToClaim,
    #[msg("Initial auction end must be in the future.")]
    InitialAuctionEndMustBeFuture,
}
