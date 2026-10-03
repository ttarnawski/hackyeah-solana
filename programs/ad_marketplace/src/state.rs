use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SlotStatus {
    Available,
    Sold,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct AdSlot {
    pub slot_id: u64,
    pub seller: Pubkey,
    pub buyer: Option<Pubkey>,
    pub price_lamports: u64,
    pub status: SlotStatus,
    #[max_len(200)]
    pub content_uri: String,
}
