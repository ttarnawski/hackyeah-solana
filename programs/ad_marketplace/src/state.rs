use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub bump: u8,
}

impl Config {
    pub const SPACE: usize = 8 + 32 + 1;
}

#[account]
pub struct Auction {
    pub supplier: Pubkey,
    pub listing_id: u64,
    pub kyb_id: u32,
    pub is_kyb_verified: bool,
    // Zero represents the initial auction; recurring cycles start at one.
    pub cycle_number: u64,
    // The initial close timestamp while cycle_number is zero; otherwise current cycle start.
    pub cycle_start_ts: i64,
    pub cycle_duration: i64,
    pub current_highest_bid: u64,
    pub current_winner: Pubkey,
    pub ad_url: [u8; 128],
    pub ad_url_len: u8,
    pub supplier_claimable: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Auction {
    pub const SPACE: usize = 256;
}
