const TrustToken = artifacts.require("TrustToken");
const AuthenticNFT = artifacts.require("AuthenticNFT");
const BrandShop = artifacts.require("BrandShop");
const UsedMarketplace = artifacts.require("UsedMarketplace");

contract("TrustChain Integration Test Suite", (accounts) => {
  const [admin, brandOwner, buyer1, seller1, buyer2] = accounts;

  let token;
  let nft;
  let shop;
  let market;

  beforeEach(async () => {
    // Deploy all fresh contracts for clean slate testing
    token = await TrustToken.new(1000000000, { from: brandOwner });
    nft = await AuthenticNFT.new({ from: brandOwner });
    shop = await BrandShop.new(token.address, nft.address, { from: brandOwner });
    market = await UsedMarketplace.new(token.address, nft.address, { from: admin });

    // Wire up brandShop authorization
    await nft.setBrandShop(shop.address, { from: brandOwner });

    // Mint some test tokens to buyer1, seller1, buyer2 for trading
    const amount = web3.utils.toWei("10000", "ether");
    await token.transfer(buyer1, amount, { from: brandOwner });
    await token.transfer(seller1, amount, { from: brandOwner });
    await token.transfer(buyer2, amount, { from: brandOwner });
  });

  describe("1. BrandShop (Primary Sales)", () => {
    it("should allow brand owner to add products", async () => {
      await shop.addProduct("Brand Sneakers", web3.utils.toWei("100", "ether"), 5, "ipfs://sneakers-metadata", "hash_sneakers_001_pattern", { from: brandOwner });
      const product = await shop.products(1);
      assert.equal(product.name, "Brand Sneakers");
      assert.equal(product.price.toString(), web3.utils.toWei("100", "ether"));
      assert.equal(product.stock.toString(), "5");
    });

    it("should allow buyers to purchase products and receive a digital certificate (NFT)", async () => {
      const price = web3.utils.toWei("100", "ether");
      await shop.addProduct("Brand Sneakers", price, 5, "ipfs://sneakers-metadata", "hash_sneakers_001_pattern", { from: brandOwner });

      // Approve Shop to spend buyer1's tokens
      await token.approve(shop.address, price, { from: buyer1 });

      // Buy product
      await shop.buyProduct(1, { from: buyer1 });

      // Confirm delivery to release escrow and mint NFT
      await shop.confirmDelivery(1, { from: buyer1 });

      // Stock should decrease to 4
      const product = await shop.products(1);
      assert.equal(product.stock.toString(), "4");

      // Buyer1 should own NFT #1
      const ownerOfNft = await nft.ownerOf(1);
      assert.equal(ownerOfNft, buyer1);

      // NFT metadata URI should be set correctly
      const tokenUri = await nft.tokenURI(1);
      assert.equal(tokenUri, "ipfs://sneakers-metadata");

      // Brand Owner should receive the payment tokens
      const brandBalance = await token.balanceOf(brandOwner);
      // BrandOwner starts with 1B tokens - 30K sent to buyers + 100 received from purchase
      const expectedBalance = web3.utils.toBN(web3.utils.toWei("1000000000", "ether"))
        .sub(web3.utils.toBN(web3.utils.toWei("30000", "ether")))
        .add(web3.utils.toBN(price));
      assert.equal(brandBalance.toString(), expectedBalance.toString());
    });

    it("should allow brand owner to cancel and refund an active order", async () => {
      const price = web3.utils.toWei("100", "ether");
      await shop.addProduct("Brand Sneakers", price, 5, "ipfs://sneakers-metadata", "hash_sneakers_001_pattern", { from: brandOwner });

      // Approve Shop to spend buyer1's tokens
      await token.approve(shop.address, price, { from: buyer1 });

      // Buy product
      await shop.buyProduct(1, { from: buyer1 });

      // Stock should decrease to 4
      let product = await shop.products(1);
      assert.equal(product.stock.toString(), "4");

      // Balance of buyer1 before cancel
      const buyerBalanceBefore = await token.balanceOf(buyer1);

      // Cancel order
      await shop.cancelOrder(1, { from: brandOwner });

      // Order status should be Refunded (2)
      const order = await shop.orders(1);
      assert.equal(order.status.toString(), "2"); // Refunded enum

      // Stock should be restored to 5
      product = await shop.products(1);
      assert.equal(product.stock.toString(), "5");

      // buyer1 should be refunded
      const buyerBalanceAfter = await token.balanceOf(buyer1);
      const expectedBalance = web3.utils.toBN(buyerBalanceBefore).add(web3.utils.toBN(price));
      assert.equal(buyerBalanceAfter.toString(), expectedBalance.toString());
    });
  });

  describe("2. UsedMarketplace (Secondary Sales & Escrow)", () => {
    let tokenId = 1;
    const price = web3.utils.toWei("100", "ether");

    beforeEach(async () => {
      // Setup: seller1 buys a product from BrandShop to get an NFT
      await shop.addProduct("Brand Bag", price, 10, "ipfs://bag-metadata", "hash_bag_001_pattern", { from: brandOwner });
      await token.approve(shop.address, price, { from: seller1 });
      await shop.buyProduct(1, { from: seller1 }); // Lock escrow
      await shop.confirmDelivery(1, { from: seller1 }); // Confirm delivery to mint NFT #1
    });

    it("should allow seller to list an item (NFT escrowed in marketplace)", async () => {
      // Approve marketplace to transfer NFT
      await nft.approve(market.address, tokenId, { from: seller1 });

      // List it for 50 tokens
      const usedPrice = web3.utils.toWei("50", "ether");
      await market.listUsedItem(tokenId, usedPrice, { from: seller1 });

      const listing = await market.listings(1);
      assert.equal(listing.seller, seller1);
      assert.equal(listing.tokenId.toString(), tokenId.toString());
      assert.equal(listing.price.toString(), usedPrice.toString());
      assert.equal(listing.status.toString(), "0"); // Active

      // Marketplace contract should now own the NFT
      const nftOwner = await nft.ownerOf(tokenId);
      assert.equal(nftOwner, market.address);
    });

    it("should allow buyer to lock funds in escrow when purchasing a used item", async () => {
      const usedPrice = web3.utils.toWei("50", "ether");
      await nft.approve(market.address, tokenId, { from: seller1 });
      await market.listUsedItem(tokenId, usedPrice, { from: seller1 });

      // Approve marketplace to spend buyer2's tokens
      await token.approve(market.address, usedPrice, { from: buyer2 });

      // Purchase used item
      await market.buyUsedItem(1, { from: buyer2 });

      const listing = await market.listings(1);
      assert.equal(listing.buyer, buyer2);
      assert.equal(listing.status.toString(), "1"); // EscrowLocked

      // Marketplace contract should now hold the buyer's tokens (escrow lockup)
      const marketTokenBalance = await token.balanceOf(market.address);
      assert.equal(marketTokenBalance.toString(), usedPrice.toString());
    });

    it("should distribute royalties and finalize trade on buyer delivery confirmation", async () => {
      const usedPrice = web3.utils.toWei("100", "ether"); // 100 tokens
      await nft.approve(market.address, tokenId, { from: seller1 });
      await market.listUsedItem(tokenId, usedPrice, { from: seller1 });

      await token.approve(market.address, usedPrice, { from: buyer2 });
      await market.buyUsedItem(1, { from: buyer2 });

      // Get brand's balance before settlement
      const brandBalanceBefore = await token.balanceOf(brandOwner);
      // Get seller's balance before settlement
      const sellerBalanceBefore = await token.balanceOf(seller1);

      // Confirm delivery
      await market.confirmDelivery(1, { from: buyer2 });

      // Trade should be completed
      const listing = await market.listings(1);
      assert.equal(listing.status.toString(), "2"); // Completed

      // NFT should be transferred to buyer2
      const nftOwner = await nft.ownerOf(tokenId);
      assert.equal(nftOwner, buyer2);

      // Royalty check: 3% of 100 ether = 3 ether should go to brandOwner
      const expectedRoyalty = web3.utils.toWei("3", "ether");
      const brandBalanceAfter = await token.balanceOf(brandOwner);
      const expectedBrandBalance = web3.utils.toBN(brandBalanceBefore).add(web3.utils.toBN(expectedRoyalty));
      assert.equal(brandBalanceAfter.toString(), expectedBrandBalance.toString());

      // Seller should receive 97 ether (97% of 100 ether)
      const expectedSellerProfit = web3.utils.toWei("97", "ether");
      const sellerBalanceAfter = await token.balanceOf(seller1);
      const expectedSellerBalance = web3.utils.toBN(sellerBalanceBefore).add(web3.utils.toBN(expectedSellerProfit));
      assert.equal(sellerBalanceAfter.toString(), expectedSellerBalance.toString());
    });

    it("should allow arbitrator to refund buyer in case of a dispute", async () => {
      const usedPrice = web3.utils.toWei("100", "ether");
      await nft.approve(market.address, tokenId, { from: seller1 });
      await market.listUsedItem(tokenId, usedPrice, { from: seller1 });

      await token.approve(market.address, usedPrice, { from: buyer2 });
      await market.buyUsedItem(1, { from: buyer2 });

      // Raise dispute with mismatched fingerprint (buyer received fake)
      await market.raiseDispute(1, "hash_bag_001_FAKE_pattern", { from: buyer2 });
      let listing = await market.listings(1);
      assert.equal(listing.status.toString(), "3"); // Disputed
      assert.equal(listing.hasDisputeFingerprintMismatch, true);
      assert.equal(listing.scannedFingerprintAtDispute, "hash_bag_001_FAKE_pattern");

      // Resolve dispute by refunding buyer
      const buyerBalanceBefore = await token.balanceOf(buyer2);
      await market.resolveDispute(1, true, { from: admin }); // true = refundToBuyer

      listing = await market.listings(1);
      assert.equal(listing.status.toString(), "4"); // Refunded

      // Buyer should get their 100 tokens back
      const buyerBalanceAfter = await token.balanceOf(buyer2);
      const expectedBuyerBalance = web3.utils.toBN(buyerBalanceBefore).add(web3.utils.toBN(usedPrice));
      assert.equal(buyerBalanceAfter.toString(), expectedBuyerBalance.toString());

      // NFT should be returned to seller1
      const nftOwner = await nft.ownerOf(tokenId);
      assert.equal(nftOwner, seller1);
    });

    it("should allow buyer or seller to save chat history and emit ChatSaved event", async () => {
      const usedPrice = web3.utils.toWei("100", "ether");
      await nft.approve(market.address, tokenId, { from: seller1 });
      await market.listUsedItem(tokenId, usedPrice, { from: seller1 });

      await token.approve(market.address, usedPrice, { from: buyer2 });
      await market.buyUsedItem(1, { from: buyer2 });

      // Listing status is now EscrowLocked (1)
      const chatData = "[buyer2]: Hello seller, please ship it.\n[seller1]: Sure, I will ship it today!";
      
      // Save chat as buyer2
      const tx = await market.saveChatHistory(1, chatData, { from: buyer2 });

      // Verify event was emitted
      const event = tx.logs.find(e => e.event === "ChatSaved");
      assert.exists(event);
      assert.equal(event.args.listingId.toString(), "1");
      assert.equal(event.args.savedBy, buyer2);
      assert.equal(event.args.chatData, chatData);

      // Verify that an unauthorized user cannot save chat
      try {
        await market.saveChatHistory(1, "unauthorized chat", { from: buyer1 });
        assert.fail("Should have failed with unauthorized error");
      } catch (error) {
        assert.include(error.message, "revert");
      }
    });
  });
});
