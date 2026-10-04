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
    #[msg("Listing title must not be empty.")]
    EmptyListingTitle,
    #[msg("Listing title exceeds 100 UTF-8 bytes.")]
    ListingTitleTooLong,
    #[msg("Listing description exceeds 3000 UTF-8 bytes.")]
    ListingDescriptionTooLong,
    #[msg("Buyout price must exceed the current highest bid.")]
    BuyoutPriceTooLow,
    #[msg("This listing has permanently closed after a buyout.")]
    ListingClosed,
}
