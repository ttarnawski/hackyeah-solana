use anchor_lang::prelude::*;

#[event]
pub struct SlotCreated {
    pub ad_slot: Pubkey,
    pub slot_id: u64,
    pub seller: Pubkey,
    pub price_lamports: u64,
}

#[event]
pub struct SlotPurchased {
    pub ad_slot: Pubkey,
    pub slot_id: u64,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price_lamports: u64,
}

#[event]
pub struct SlotCancelled {
    pub ad_slot: Pubkey,
    pub slot_id: u64,
    pub seller: Pubkey,
}
