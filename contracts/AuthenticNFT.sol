// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AuthenticNFT is ERC721URIStorage, ERC2981, Ownable {
    // Address of the authorized BrandShop that can mint certificates
    address public brandShop;

    // Counter for public/everyday items to prevent collision (starts at 1,000,000)
    uint256 public nextPublicTokenId = 1000000;

    // Mapping from token ID to unique physical fingerprint hash (AI camera micro-pattern scan)
    mapping(uint256 => string) public physicalFingerprints;

    event BrandShopUpdated(address indexed newBrandShop);
    event PhysicalFingerprintRegistered(uint256 indexed tokenId, string physicalFingerprint);

    constructor() ERC721("AuthenticNFT", "ANFT") {
        // Default royalty is 3% (300 basis points) paid to the contract deployer (original brand)
        _setDefaultRoyalty(msg.sender, 300);
    }

    modifier onlyMinter() {
        require(msg.sender == owner() || msg.sender == brandShop, "Not authorized to mint");
        _;
    }

    function setBrandShop(address _brandShop) external onlyOwner {
        brandShop = _brandShop;
        emit BrandShopUpdated(_brandShop);
    }

    function mint(address to, uint256 tokenId, string memory tokenURI, string memory physicalFingerprint) external onlyMinter {
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        physicalFingerprints[tokenId] = physicalFingerprint;
        emit PhysicalFingerprintRegistered(tokenId, physicalFingerprint);
    }

    // Public mint function for everyday items (no minter restriction)
    function mintPublic(address to, string memory tokenURI, string memory physicalFingerprint) external returns (uint256) {
        uint256 tokenId = nextPublicTokenId;
        nextPublicTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        physicalFingerprints[tokenId] = physicalFingerprint;
        emit PhysicalFingerprintRegistered(tokenId, physicalFingerprint);
        return tokenId;
    }

    // Verify physical fingerprint against registered on-chain fingerprint
    function verifyFingerprint(uint256 tokenId, string memory scannedFingerprint) public view returns (bool) {
        return keccak256(bytes(physicalFingerprints[tokenId])) == keccak256(bytes(scannedFingerprint));
    }

    // Set custom royalty receiver/rate for a specific token
    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeNumerator) external onlyOwner {
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
    }

    // Resolve multiple inheritance for supportsInterface
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // Override _burn to clear custom royalty and resolve inheritance
    function _burn(uint256 tokenId) internal override(ERC721URIStorage) {
        super._burn(tokenId);
        _resetTokenRoyalty(tokenId);
    }
}
