use anchor_lang::prelude::*;

use crate::{
    constants::AD_SLOT_SEED,
    error::MarketplaceError,
    AdSlot, SlotCancelled, SlotStatus,
};

#[derive(Accounts)]
#[instruction(slot_id: u64)]
pub struct CancelSlot<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [AD_SLOT_SEED, seller.key().as_ref(), &slot_id.to_le_bytes()],
        bump,
        has_one = seller,
        constraint = ad_slot.slot_id == slot_id
    )]
    pub ad_slot: Account<'info, AdSlot>,
}

pub fn handle_cancel_slot(ctx: Context<CancelSlot>, slot_id: u64) -> Result<()> {
    require!(
        ctx.accounts.ad_slot.status == SlotStatus::Available,
        MarketplaceError::SlotNotAvailable
    );

    ctx.accounts.ad_slot.status = SlotStatus::Cancelled;
    emit!(SlotCancelled {
        ad_slot: ctx.accounts.ad_slot.key(),
        slot_id,
        seller: ctx.accounts.seller.key(),
    });

    Ok(())
}
