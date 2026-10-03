use anchor_lang::prelude::*;

use crate::{
    constants::{AD_SLOT_SEED, MAX_CONTENT_URI_LENGTH},
    error::MarketplaceError,
    AdSlot, SlotCreated, SlotStatus,
};

#[derive(Accounts)]
#[instruction(slot_id: u64)]
pub struct CreateSlot<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        init,
        payer = seller,
        space = 8 + AdSlot::INIT_SPACE,
        seeds = [AD_SLOT_SEED, seller.key().as_ref(), &slot_id.to_le_bytes()],
        bump
    )]
    pub ad_slot: Account<'info, AdSlot>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_slot(
    ctx: Context<CreateSlot>,
    slot_id: u64,
    price_lamports: u64,
    content_uri: String,
) -> Result<()> {
    require!(price_lamports > 0, MarketplaceError::InvalidPrice);
    require!(
        !content_uri.is_empty() && content_uri.len() <= MAX_CONTENT_URI_LENGTH,
        MarketplaceError::InvalidContentUri
    );

    let seller = ctx.accounts.seller.key();
    let ad_slot = &mut ctx.accounts.ad_slot;
    ad_slot.set_inner(AdSlot {
        slot_id,
        seller,
        buyer: None,
        price_lamports,
        status: SlotStatus::Available,
        content_uri,
    });

    emit!(SlotCreated {
        ad_slot: ad_slot.key(),
        slot_id,
        seller,
        price_lamports,
    });

    Ok(())
}
