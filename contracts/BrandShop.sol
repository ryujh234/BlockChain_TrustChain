// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IAuthenticNFT {
    function mint(address to, uint256 tokenId, string calldata tokenURI, string calldata physicalFingerprint) external;
}

contract BrandShop is Ownable {
    IERC20 public paymentToken;
    IAuthenticNFT public nftContract;

    enum OrderStatus { Active, Completed, Refunded }

    struct Product {
        uint256 id;
        string name;
        uint256 price; // Price in ERC-20 tokens
        uint256 stock;
        string tokenURI; // IPFS metadata for the product NFT
        string registeredFingerprint; // Registered by brand at product creation!
    }

    struct Order {
        uint256 id;
        address buyer;
        uint256 productId;
        uint256 price;
        OrderStatus status;
    }

    mapping(uint256 => Product) public products;
    uint256 public productCount;
    uint256 public nextTokenId = 1;

    mapping(uint256 => Order) public orders;
    uint256 public orderCount;

    event ProductAdded(uint256 indexed id, string name, uint256 price, uint256 stock, string registeredFingerprint);
    event ProductRemoved(uint256 indexed id);
    event ProductPurchased(uint256 indexed orderId, address indexed buyer, uint256 indexed productId, uint256 price);
    event DeliveryConfirmed(uint256 indexed orderId, address indexed buyer, uint256 indexed tokenId);

    constructor(address _paymentToken, address _nftContract) {
        paymentToken = IERC20(_paymentToken);
        nftContract = IAuthenticNFT(_nftContract);
    }

    function addProduct(string calldata name, uint256 price, uint256 stock, string calldata tokenURI, string calldata registeredFingerprint) external onlyOwner {
        productCount++;
        products[productCount] = Product(productCount, name, price, stock, tokenURI, registeredFingerprint);
        emit ProductAdded(productCount, name, price, stock, registeredFingerprint);
    }

    function removeProduct(uint256 productId) external onlyOwner {
        require(productId > 0 && productId <= productCount, "Product does not exist");
        require(products[productId].id > 0, "Product already deleted");
        delete products[productId];
        emit ProductRemoved(productId);
    }

    function updateStock(uint256 productId, uint256 newStock) external onlyOwner {
        require(productId > 0 && productId <= productCount, "Product does not exist");
        require(products[productId].id > 0, "Product has been deleted");
        products[productId].stock = newStock;
    }

    // 1. 구매자가 브랜드 샵에서 구매할 때 대금을 컨트랙트에 동결 (에스크로 시작)
    function buyProduct(uint256 productId) external {
        require(productId > 0 && productId <= productCount, "Product does not exist");
        Product storage product = products[productId];
        require(product.id > 0, "Product has been deleted");
        require(product.stock > 0, "Out of stock");

        // 재고 차감
        product.stock--;

        // 결제 대금(ERC-20)을 브랜드 샵 컨트랙트에 예치 (에스크로 잠금)
        uint256 price = product.price;
        require(paymentToken.transferFrom(msg.sender, address(this), price), "Payment failed");

        orderCount++;
        orders[orderCount] = Order(orderCount, msg.sender, productId, price, OrderStatus.Active);

        emit ProductPurchased(orderCount, msg.sender, productId, price);
    }

    // 2. 구매자가 배송 실물을 받고 확인 시 대금이 브랜드 소유자에게 송금되며 보증서 NFT 발급
    function confirmDelivery(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Active, "Order not active");
        require(msg.sender == order.buyer, "Only buyer can confirm delivery");

        order.status = OrderStatus.Completed;

        // 동결 대금을 브랜드 지갑(owner)으로 전송
        require(paymentToken.transfer(owner(), order.price), "Payment release failed");

        // 브랜드가 등록했던 정품 지문(registeredFingerprint) 정보를 사용하여 보증서 NFT 발급
        Product memory product = products[order.productId];
        uint256 tokenId = nextTokenId;
        nextTokenId++;
        nftContract.mint(order.buyer, tokenId, product.tokenURI, product.registeredFingerprint);

        emit DeliveryConfirmed(orderId, order.buyer, tokenId);
    }

    event OrderCancelled(uint256 indexed orderId, address indexed buyer);

    // 3. 배송 중인 상품을 브랜드 본사(owner) 측에서 취소하고 대금을 환불 처리 (에스크로 해제 및 재고 복구)
    function cancelOrder(uint256 orderId) external onlyOwner {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Active, "Order not active");

        order.status = OrderStatus.Refunded;

        // 동결 대금을 구매자에게 반환
        require(paymentToken.transfer(order.buyer, order.price), "Refund transfer failed");

        // 상품 재고가 삭제되지 않은 경우 재고 복구
        if (products[order.productId].id > 0) {
            products[order.productId].stock++;
        }

        emit OrderCancelled(orderId, order.buyer);
    }
}
