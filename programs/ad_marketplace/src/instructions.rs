use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::{
    constants::{
        AUCTION_SEED, CONFIG_SEED, DEFAULT_CYCLE_DURATION, LISTING_METADATA_SEED,
        MAX_AD_URL_LENGTH, MAX_LISTING_DESCRIPTION_LENGTH, MAX_LISTING_TITLE_LENGTH, VAULT_SEED,
    },
    error::CustomError,
    Auction, Config, ListingMetadata,
};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = Config::SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    listing_id: u64,
    kyb_id: u32,
    title: String,
    description: String,
    buyout_price: u64,
    initial_auction_end_ts: i64,
    cycle_duration: i64
)]
pub struct CreateListing<'info> {
    #[account(
        init,
        payer = supplier,
        space = Auction::SPACE,
        seeds = [AUCTION_SEED, supplier.key().as_ref(), &listing_id.to_le_bytes()],
        bump
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        init,
        payer = supplier,
        space = ListingMetadata::space(
            title.len().min(MAX_LISTING_TITLE_LENGTH),
            description.len().min(MAX_LISTING_DESCRIPTION_LENGTH)
        ),
        seeds = [LISTING_METADATA_SEED, auction.key().as_ref()],
        bump
    )]
    pub listing_metadata: Account<'info, ListingMetadata>,

    /// CHECK: This system-owned PDA is an empty-lamport vault with no account data.
    #[account(
        seeds = [VAULT_SEED, auction.key().as_ref()],
        bump,
        owner = system_program.key()
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub supplier: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(title: String, description: String, buyout_price: u64)]
pub struct InitializeListingMetadata<'info> {
    #[account(
        mut,
        seeds = [AUCTION_SEED, supplier.key().as_ref(), &auction.listing_id.to_le_bytes()],
        bump = auction.bump,
        has_one = supplier
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        init,
        payer = supplier,
        space = ListingMetadata::space(
            title.len().min(MAX_LISTING_TITLE_LENGTH),
            description.len().min(MAX_LISTING_DESCRIPTION_LENGTH)
        ),
        seeds = [LISTING_METADATA_SEED, auction.key().as_ref()],
        bump
    )]
    pub listing_metadata: Account<'info, ListingMetadata>,

    #[account(mut)]
    pub supplier: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(title: String, description: String)]
pub struct UpdateListingMetadata<'info> {
    #[account(
        seeds = [AUCTION_SEED, supplier.key().as_ref(), &auction.listing_id.to_le_bytes()],
        bump = auction.bump,
        has_one = supplier
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        mut,
        realloc = ListingMetadata::space(
            title.len().min(MAX_LISTING_TITLE_LENGTH),
            description.len().min(MAX_LISTING_DESCRIPTION_LENGTH)
        ),
        realloc::payer = supplier,
        realloc::zero = false,
        seeds = [LISTING_METADATA_SEED, auction.key().as_ref()],
        bump = listing_metadata.bump,
        has_one = auction
    )]
    pub listing_metadata: Account<'info, ListingMetadata>,

    #[account(mut)]
    pub supplier: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifySupplierKyb<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.supplier.as_ref(), &auction.listing_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Account<'info, Auction>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.supplier.as_ref(), &auction.listing_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        mut,
        seeds = [LISTING_METADATA_SEED, auction.key().as_ref()],
        bump = listing_metadata.bump,
        has_one = auction
    )]
    pub listing_metadata: Account<'info, ListingMetadata>,

    /// CHECK: The vault PDA is checked against the auction address and stored bump.
    #[account(
        mut,
        seeds = [VAULT_SEED, auction.key().as_ref()],
        bump = auction.vault_bump,
        owner = system_program.key()
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub bidder: Signer<'info>,

    /// CHECK: Refunds are sent here only after matching this key to the recorded winner.
    #[account(mut)]
    pub previous_winner: UncheckedAccount<'info>,

    /// CHECK: This address is constrained to the listing supplier and only receives payouts.
    #[account(mut, address = auction.supplier)]
    pub supplier: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimFunds<'info> {
    #[account(
        mut,
        seeds = [AUCTION_SEED, auction.supplier.as_ref(), &auction.listing_id.to_le_bytes()],
        bump = auction.bump
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        seeds = [LISTING_METADATA_SEED, auction.key().as_ref()],
        bump = listing_metadata.bump,
        has_one = auction
    )]
    pub listing_metadata: Account<'info, ListingMetadata>,

    /// CHECK: The vault PDA is checked against the auction address and stored bump.
    #[account(
        mut,
        seeds = [VAULT_SEED, auction.key().as_ref()],
        bump = auction.vault_bump,
        owner = system_program.key()
    )]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: This address is constrained to the listing supplier and only receives payouts.
    #[account(mut, address = auction.supplier)]
    pub supplier: UncheckedAccount<'info>,

    #[account(mut)]
    pub caller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
    ctx.accounts.config.set_inner(Config {
        admin: ctx.accounts.admin.key(),
        bump: ctx.bumps.config,
    });
    Ok(())
}

pub fn handle_create_listing(
    ctx: Context<CreateListing>,
    listing_id: u64,
    kyb_id: u32,
    title: String,
    description: String,
    buyout_price: u64,
    initial_auction_end_ts: i64,
    cycle_duration: i64,
) -> Result<()> {
    require!(
        (1_000_000..=9_999_999).contains(&kyb_id),
        CustomError::InvalidKybId
    );
    validate_listing_metadata(&title, &description)?;

    let now = Clock::get()?.unix_timestamp;
    require!(
        initial_auction_end_ts > now,
        CustomError::InitialAuctionEndMustBeFuture
    );
    ctx.accounts.auction.set_inner(Auction {
        supplier: ctx.accounts.supplier.key(),
        listing_id,
        kyb_id,
        is_kyb_verified: false,
        cycle_number: 0,
        cycle_start_ts: initial_auction_end_ts,
        cycle_duration: if cycle_duration > 0 {
            cycle_duration
        } else {
            DEFAULT_CYCLE_DURATION
        },
        current_highest_bid: 0,
        current_winner: Pubkey::default(),
        ad_url: [0; MAX_AD_URL_LENGTH],
        ad_url_len: 0,
        supplier_claimable: 0,
        bump: ctx.bumps.auction,
        vault_bump: ctx.bumps.vault,
    });
    ctx.accounts.listing_metadata.set_inner(ListingMetadata {
        auction: ctx.accounts.auction.key(),
        title,
        description,
        buyout_price,
        is_closed: false,
        bump: ctx.bumps.listing_metadata,
    });

    Ok(())
}

pub fn handle_initialize_listing_metadata(
    ctx: Context<InitializeListingMetadata>,
    title: String,
    description: String,
    buyout_price: u64,
) -> Result<()> {
    validate_listing_metadata(&title, &description)?;
    require!(
        buyout_price == 0 || buyout_price > ctx.accounts.auction.current_highest_bid,
        CustomError::BuyoutPriceTooLow
    );

    ctx.accounts.listing_metadata.set_inner(ListingMetadata {
        auction: ctx.accounts.auction.key(),
        title,
        description,
        buyout_price,
        is_closed: false,
        bump: ctx.bumps.listing_metadata,
    });
    Ok(())
}

pub fn handle_update_listing_metadata(
    ctx: Context<UpdateListingMetadata>,
    title: String,
    description: String,
) -> Result<()> {
    validate_listing_metadata(&title, &description)?;
    let metadata = &mut ctx.accounts.listing_metadata;
    metadata.title = title;
    metadata.description = description;
    Ok(())
}

pub fn handle_verify_supplier_kyb(
    ctx: Context<VerifySupplierKyb>,
    is_verified: bool,
) -> Result<()> {
    ctx.accounts.auction.is_kyb_verified = is_verified;
    Ok(())
}

pub fn handle_place_bid(ctx: Context<PlaceBid>, bid_amount: u64, ad_url: String) -> Result<()> {
    let ad_url_bytes = ad_url.as_bytes();
    require!(
        ctx.accounts.auction.is_kyb_verified,
        CustomError::KybNotVerified
    );
    require!(
        !ctx.accounts.listing_metadata.is_closed,
        CustomError::ListingClosed
    );
    require!(
        ad_url_bytes.len() <= MAX_AD_URL_LENGTH,
        CustomError::UrlTooLong
    );

    let now = Clock::get()?.unix_timestamp;
    let auction_key = ctx.accounts.auction.key();
    let auction = &mut ctx.accounts.auction;
    settle_expired_cycle(auction, now)?;
    pay_supplier_claimable(
        auction,
        &ctx.accounts.system_program,
        &ctx.accounts.vault,
        &auction_key,
        ctx.accounts.supplier.to_account_info(),
    )?;

    require!(
        bid_amount > auction.current_highest_bid,
        CustomError::BidTooLow
    );

    let buyout_price = ctx.accounts.listing_metadata.buyout_price;
    let triggers_buyout = buyout_price > 0 && bid_amount >= buyout_price;
    let vault_bump = auction.vault_bump;
    if auction.current_winner != Pubkey::default() {
        require_keys_eq!(
            ctx.accounts.previous_winner.key(),
            auction.current_winner,
            CustomError::InvalidPreviousWinner
        );
        transfer_from_vault(
            &ctx.accounts.system_program,
            &ctx.accounts.vault,
            ctx.accounts.previous_winner.to_account_info(),
            &auction_key,
            vault_bump,
            auction.current_highest_bid,
        )?;
    }

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.bidder.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        bid_amount,
    )?;

    if triggers_buyout {
        let excess = bid_amount
            .checked_sub(buyout_price)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if excess > 0 {
            transfer_from_vault(
                &ctx.accounts.system_program,
                &ctx.accounts.vault,
                ctx.accounts.bidder.to_account_info(),
                &auction_key,
                vault_bump,
                excess,
            )?;
        }
        auction.supplier_claimable = auction
            .supplier_claimable
            .checked_add(buyout_price)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        auction.current_highest_bid = 0;
        ctx.accounts.listing_metadata.is_closed = true;
    } else {
        auction.current_highest_bid = bid_amount;
    }
    auction.current_winner = ctx.accounts.bidder.key();
    store_current_ad_url(auction, ad_url_bytes);

    Ok(())
}

pub fn handle_claim_funds(ctx: Context<ClaimFunds>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let auction_key = ctx.accounts.auction.key();
    let auction = &mut ctx.accounts.auction;
    if !ctx.accounts.listing_metadata.is_closed {
        settle_expired_cycle(auction, now)?;
    }

    let payout = auction.supplier_claimable;
    require!(payout > 0, CustomError::NoFundsToClaim);
    pay_supplier_claimable(
        auction,
        &ctx.accounts.system_program,
        &ctx.accounts.vault,
        &auction_key,
        ctx.accounts.supplier.to_account_info(),
    )
}

fn validate_listing_metadata(title: &str, description: &str) -> Result<()> {
    require!(!title.trim().is_empty(), CustomError::EmptyListingTitle);
    require!(
        title.len() <= MAX_LISTING_TITLE_LENGTH,
        CustomError::ListingTitleTooLong
    );
    require!(
        description.len() <= MAX_LISTING_DESCRIPTION_LENGTH,
        CustomError::ListingDescriptionTooLong
    );
    Ok(())
}

fn store_current_ad_url(auction: &mut Auction, ad_url_bytes: &[u8]) {
    auction.ad_url = [0; MAX_AD_URL_LENGTH];
    auction.ad_url[..ad_url_bytes.len()].copy_from_slice(ad_url_bytes);
    auction.ad_url_len = ad_url_bytes.len() as u8;
}

fn settle_expired_cycle(auction: &mut Auction, now: i64) -> Result<()> {
    if auction.cycle_duration <= 0 {
        return Err(ProgramError::InvalidArgument.into());
    }

    if auction.cycle_number == 0 {
        if now < auction.cycle_start_ts {
            return Ok(());
        }
        settle_current_bid(auction)?;
        auction.cycle_number = 1;
    }

    let cycle_end = auction
        .cycle_start_ts
        .checked_add(auction.cycle_duration)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if now < cycle_end {
        return Ok(());
    }

    let elapsed_seconds = now
        .checked_sub(auction.cycle_start_ts)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let elapsed_cycles = elapsed_seconds / auction.cycle_duration;
    let elapsed_cycles_u64 =
        u64::try_from(elapsed_cycles).map_err(|_| ProgramError::ArithmeticOverflow)?;
    let elapsed_duration = elapsed_cycles
        .checked_mul(auction.cycle_duration)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    settle_current_bid(auction)?;
    auction.cycle_number = auction
        .cycle_number
        .checked_add(elapsed_cycles_u64)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    auction.cycle_start_ts = auction
        .cycle_start_ts
        .checked_add(elapsed_duration)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok(())
}

fn settle_current_bid(auction: &mut Auction) -> Result<()> {
    if auction.current_highest_bid > 0 {
        auction.supplier_claimable = auction
            .supplier_claimable
            .checked_add(auction.current_highest_bid)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }
    auction.current_highest_bid = 0;
    auction.current_winner = Pubkey::default();
    auction.ad_url = [0; MAX_AD_URL_LENGTH];
    auction.ad_url_len = 0;

    Ok(())
}

fn pay_supplier_claimable<'info>(
    auction: &mut Auction,
    system_program: &Program<'info, System>,
    vault: &UncheckedAccount<'info>,
    auction_key: &Pubkey,
    supplier: AccountInfo<'info>,
) -> Result<()> {
    let payout = auction.supplier_claimable;
    if payout == 0 {
        return Ok(());
    }
    auction.supplier_claimable = 0;
    transfer_from_vault(
        system_program,
        vault,
        supplier,
        auction_key,
        auction.vault_bump,
        payout,
    )
}

fn transfer_from_vault<'info>(
    system_program: &Program<'info, System>,
    vault: &UncheckedAccount<'info>,
    recipient: AccountInfo<'info>,
    auction_key: &Pubkey,
    vault_bump: u8,
    amount: u64,
) -> Result<()> {
    let bump_seed = [vault_bump];
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, auction_key.as_ref(), &bump_seed];
    system_program::transfer(
        CpiContext::new_with_signer(
            system_program.key(),
            Transfer {
                from: vault.to_account_info(),
                to: recipient,
            },
            &[signer_seeds],
        ),
        amount,
    )
}
