const TrustToken = artifacts.require("TrustToken");
const AuthenticNFT = artifacts.require("AuthenticNFT");
const BrandShop = artifacts.require("BrandShop");
const UsedMarketplace = artifacts.require("UsedMarketplace");

module.exports = async function (deployer, network, accounts) {
  // 1. Deploy TrustToken with 1 billion supply
  const initialSupply = 1000000000;
  await deployer.deploy(TrustToken, initialSupply);
  const trustTokenInstance = await TrustToken.deployed();

  // 2. Deploy AuthenticNFT
  await deployer.deploy(AuthenticNFT);
  const authenticNFTInstance = await AuthenticNFT.deployed();

  // 3. Deploy BrandShop
  await deployer.deploy(BrandShop, trustTokenInstance.address, authenticNFTInstance.address);
  const brandShopInstance = await BrandShop.deployed();

  // 4. Deploy UsedMarketplace
  await deployer.deploy(UsedMarketplace, trustTokenInstance.address, authenticNFTInstance.address);
  const usedMarketplaceInstance = await UsedMarketplace.deployed();

  // 5. Authorize BrandShop to mint NFTs in AuthenticNFT
  await authenticNFTInstance.setBrandShop(brandShopInstance.address);

  console.log("====================================================");
  console.log("TrustChain Smart Contracts Deployed Successfully!");
  console.log("TrustToken Address:     ", trustTokenInstance.address);
  console.log("AuthenticNFT Address:   ", authenticNFTInstance.address);
  console.log("BrandShop Address:      ", brandShopInstance.address);
  console.log("UsedMarketplace Address:", usedMarketplaceInstance.address);
  console.log("====================================================");
};
