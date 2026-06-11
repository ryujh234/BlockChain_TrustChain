// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IAuthenticNFTForMarket {
    function physicalFingerprints(uint256 tokenId) external view returns (string memory);
    function mintPublic(address to, string calldata tokenURI, string calldata physicalFingerprint) external returns (uint256);
}

contract UsedMarketplace is Ownable, IERC721Receiver {
    IERC20 public paymentToken;
    IERC721 public nftContract;

    enum TradeStatus { Active, EscrowLocked, Completed, Disputed, Refunded }

    struct Listing {
        uint256 id;
        address seller;
        address buyer;
        uint256 tokenId;
        uint256 price;
        TradeStatus status;
        bool hasDisputeFingerprintMismatch;
        string scannedFingerprintAtDispute;
    }

    mapping(uint256 => Listing) public listings;
    uint256 public listingCount;

    event ItemListed(uint256 indexed id, address indexed seller, uint256 indexed tokenId, uint256 price);
    event ListingCancelled(uint256 indexed id);
    event EscrowLocked(uint256 indexed id, address indexed buyer, uint256 price);
    event TradeCompleted(uint256 indexed id, address indexed buyer, uint256 price, uint256 royaltyPaid);
    event DisputeRaised(uint256 indexed id, address indexed raisedBy);
    event DisputeResolved(uint256 indexed id, bool indexed refundedToBuyer);
    event RefundApproved(uint256 indexed id, address indexed approvedBy);
    event MutualRefundExecuted(uint256 indexed id);
    event ChatSaved(uint256 indexed listingId, address indexed savedBy, string chatData);

    mapping(uint256 => bool) public buyerRefundApproved;
    mapping(uint256 => bool) public sellerRefundApproved;

    constructor(address _paymentToken, address _nftContract) {
        paymentToken = IERC20(_paymentToken);
        nftContract = IERC721(_nftContract);
    }

    function cancelUsedListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.status == TradeStatus.Active, "Listing not active");
        require(msg.sender == listing.seller, "Only seller can cancel");

        listing.status = TradeStatus.Refunded;
        nftContract.safeTransferFrom(address(this), listing.seller, listing.tokenId);

        emit ListingCancelled(listingId);
    }

    function approveRefund(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.status == TradeStatus.EscrowLocked || listing.status == TradeStatus.Disputed, "Invalid trade status for refund");
        require(msg.sender == listing.buyer || msg.sender == listing.seller, "Only trade participants can approve refund");

        if (msg.sender == listing.buyer) {
            buyerRefundApproved[listingId] = true;
            emit RefundApproved(listingId, msg.sender);
        } else {
            sellerRefundApproved[listingId] = true;
            emit RefundApproved(listingId, msg.sender);
        }

        // If both agreed, execute refund
        if (buyerRefundApproved[listingId] && sellerRefundApproved[listingId]) {
            listing.status = TradeStatus.Refunded;

            // Refund payment back to buyer
            require(paymentToken.transfer(listing.buyer, listing.price), "Refund transfer failed");

            // Return NFT back to seller
            nftContract.safeTransferFrom(address(this), listing.seller, listing.tokenId);

            // Clear mappings
            buyerRefundApproved[listingId] = false;
            sellerRefundApproved[listingId] = false;

            emit MutualRefundExecuted(listingId);
        }
    }

    function listUsedItem(uint256 tokenId, uint256 price) external {
        require(price > 0, "Price must be greater than zero");
        require(nftContract.ownerOf(tokenId) == msg.sender, "You do not own this NFT");

        listingCount++;

        // Escrow the NFT in this contract
        nftContract.safeTransferFrom(msg.sender, address(this), tokenId);

        listings[listingCount] = Listing(
            listingCount,
            msg.sender,
            address(0),
            tokenId,
            price,
            TradeStatus.Active,
            false,
            ""
        );

        emit ItemListed(listingCount, msg.sender, tokenId, price);
    }

    // Mint and list an everyday item in a single transaction
    function mintAndListUsedItem(string calldata tokenURI, string calldata physicalFingerprint, uint256 price) external {
        require(price > 0, "Price must be greater than zero");

        // Mint the NFT directly to this marketplace contract (acting as escrow)
        uint256 tokenId = IAuthenticNFTForMarket(address(nftContract)).mintPublic(address(this), tokenURI, physicalFingerprint);

        listingCount++;

        listings[listingCount] = Listing(
            listingCount,
            msg.sender,
            address(0),
            tokenId,
            price,
            TradeStatus.Active,
            false,
            ""
        );

        emit ItemListed(listingCount, msg.sender, tokenId, price);
    }

    function buyUsedItem(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.status == TradeStatus.Active, "Listing not active");
        require(msg.sender != listing.seller, "Seller cannot buy their own item");

        listing.buyer = msg.sender;
        listing.status = TradeStatus.EscrowLocked;

        // Escrow the payment tokens in this contract
        require(paymentToken.transferFrom(msg.sender, address(this), listing.price), "Escrow payment failed");

        emit EscrowLocked(listingId, msg.sender, listing.price);
    }

    function confirmDelivery(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.status == TradeStatus.EscrowLocked, "Not in escrow");
        require(msg.sender == listing.buyer, "Only buyer can confirm delivery");

        _settleTrade(listingId);
    }

    function raiseDispute(uint256 listingId, string calldata scannedFingerprint) external {
        Listing storage listing = listings[listingId];
        require(listing.status == TradeStatus.EscrowLocked, "Not in escrow");
        require(msg.sender == listing.buyer || msg.sender == listing.seller, "Only trade participants can dispute");

        listing.status = TradeStatus.Disputed;
        listing.scannedFingerprintAtDispute = scannedFingerprint;

        // Retrieve registered physical fingerprint from the NFT contract
        string memory registeredFingerprint = IAuthenticNFTForMarket(address(nftContract)).physicalFingerprints(listing.tokenId);
        
        // If the scanned fingerprint does not match the on-chain recorded fingerprint, flag it
        if (keccak256(bytes(registeredFingerprint)) != keccak256(bytes(scannedFingerprint))) {
            listing.hasDisputeFingerprintMismatch = true;
        } else {
            listing.hasDisputeFingerprintMismatch = false;
        }

        emit DisputeRaised(listingId, msg.sender);
    }

    function resolveDispute(uint256 listingId, bool refundToBuyer) external onlyOwner {
        Listing storage listing = listings[listingId];
        require(listing.status == TradeStatus.Disputed, "Trade is not in dispute");

        if (refundToBuyer) {
            listing.status = TradeStatus.Refunded;

            // Refund payment back to buyer
            require(paymentToken.transfer(listing.buyer, listing.price), "Refund failed");

            // Return NFT back to seller
            nftContract.safeTransferFrom(address(this), listing.seller, listing.tokenId);

            emit DisputeResolved(listingId, true);
        } else {
            // Force settle the trade in favor of the seller
            _settleTrade(listingId);
            emit DisputeResolved(listingId, false);
        }
    }

    // Internal helper to distribute royalties and purchase funds
    function _settleTrade(uint256 listingId) internal {
        Listing storage listing = listings[listingId];
        listing.status = TradeStatus.Completed;

        uint256 price = listing.price;
        uint256 royaltyAmount = 0;
        address royaltyReceiver = address(0);

        // Check if NFT supports ERC-2981 royalty standard
        if (IERC165(address(nftContract)).supportsInterface(type(IERC2981).interfaceId)) {
            try IERC2981(address(nftContract)).royaltyInfo(listing.tokenId, price) returns (address receiver, uint256 amount) {
                royaltyReceiver = receiver;
                royaltyAmount = amount;
            } catch {}
        }

        // Pay royalty to creator/brand if applicable
        if (royaltyReceiver != address(0) && royaltyAmount > 0) {
            require(paymentToken.transfer(royaltyReceiver, royaltyAmount), "Royalty transfer failed");
        }

        // Pay remainder to seller
        uint256 sellerAmount = price - royaltyAmount;
        require(paymentToken.transfer(listing.seller, sellerAmount), "Seller settlement failed");

        // Transfer NFT to buyer
        nftContract.safeTransferFrom(address(this), listing.buyer, listing.tokenId);

        emit TradeCompleted(listingId, listing.buyer, price, royaltyAmount);
    }

    function saveChatHistory(uint256 listingId, string calldata chatData) external {
        Listing storage listing = listings[listingId];
        require(listing.status == TradeStatus.EscrowLocked || listing.status == TradeStatus.Disputed, "Invalid trade status for saving chat");
        require(msg.sender == listing.buyer || msg.sender == listing.seller || msg.sender == owner(), "Unauthorized to save chat");
        
        emit ChatSaved(listingId, msg.sender, chatData);
    }

    // Required override to receive safe ERC721 transfers
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
