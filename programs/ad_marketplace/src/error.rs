use anchor_lang::prelude::*;

#[error_code]
pub enum MarketplaceError {
    #[msg("The listing price must be greater than zero")]
    InvalidPrice,
    #[msg("The content URI must contain between 1 and 200 bytes")]
    InvalidContentUri,
    #[msg("The advertising slot is not available")]
    SlotNotAvailable,
    #[msg("The buyer and seller must be different")]
    SelfPurchase,
}
