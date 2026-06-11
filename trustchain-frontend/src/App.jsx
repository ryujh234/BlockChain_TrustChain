import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

// 스마트 컨트랙트 ABI 로드
import TrustTokenAbi from "./contracts/TrustToken.json";
import AuthenticNFTAbi from "./contracts/AuthenticNFT.json";
import BrandShopAbi from "./contracts/BrandShop.json";
import UsedMarketplaceAbi from "./contracts/UsedMarketplace.json";

const EVERYDAY_CATEGORY_URI = "ipfs://everyday/other";

function App() {
  // 네비게이션 탭 상태
  const [activeTab, setActiveTab] = useState("shop"); // 'shop', 'inventory', 'marketplace', 'history', 'admin'

  // 블록체인 상태 변수
  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("0");
  const [networkName, setNetworkName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [contractsDeployed, setContractsDeployed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // 스마트 컨트랙트 인스턴스
  const [contracts, setContracts] = useState({
    token: null,
    nft: null,
    shop: null,
    market: null,
  });

  // 상점 및 마켓플레이스 데이터 상태
  const [products, setProducts] = useState([]);
  const [myNfts, setMyNfts] = useState([]);
  const [myBrandOrders, setMyBrandOrders] = useState([]);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [listings, setListings] = useState([]);
  const [disputedListings, setDisputedListings] = useState([]);

  // 실시간 하이브리드 채팅 상태 변수 및 AI 모델 상태
  const [netModel, setNetModel] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState("");
  const [activeChatChannel, setActiveChatChannel] = useState(null); // { id, title, sender, recipient, listingId, type }
  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState("");
  const [isArchivingChat, setIsArchivingChat] = useState(false);

  // 입력 필드 상태
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    stock: "",
    uri: "",
    fingerprint: "",
    colorPropsMacro: null,
    colorPropsMicro: null,
  });
  const [everydayItem, setEverydayItem] = useState({
    name: "",
    price: "",
    uri: EVERYDAY_CATEGORY_URI,
    fingerprint: "",
    colorPropsMacro: null,
    colorPropsMicro: null,
  });
  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedTopUpAmount, setSelectedTopUpAmount] = useState(1000);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");

  const topUpOptions = [1000, 5000, 10000];
  const paymentMethods = [
    { id: "card", label: "카드", detail: "신용/체크카드" },
    { id: "kakao", label: "카카오페이", detail: "간편결제" },
    { id: "toss", label: "토스", detail: "토스페이" },
  ];

  // 카메라 스캔 모달 상태
  const [scanModal, setScanModal] = useState({
    open: false,
    stage: "", // "camera_feed" | "scanning" | "success" | "delivery_success" | "delivery_fail"
    photoStep: "macro", // "macro" | "micro"
    progress: 0,
    isBrandCreate: false,
    isEverydayCreate: false,
    brandOrder: null,
    listing: null,
    productName: "",
    macroProps: null,
    macroFingerprint: null,
    capturedMacroImage: null,
    capturedMicroImage: null,
    microProps: null,
    generatedFingerprint: "",
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [cameraPermission, setCameraPermission] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // 네트워크 이름 변환 헬퍼
  const getNetworkName = (chainId) => {
    const networks = {
      1: "Ethereum Mainnet",
      3: "Ropsten",
      4: "Rinkeby",
      5: "Görli",
      42: "Kovan",
      5777: "Ganache (Local)",
      1337: "Hardhat (Local)",
    };
    return networks[chainId] || `Chain ID: ${chainId}`;
  };

  // 로그 추가
  const addLog = (message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString("ko-KR");
    setLogs((prev) => [{ message, type, timestamp }, ...prev].slice(0, 50));
  };

  // 알림 추가
  const addAlert = (message, type = "warning") => {
    const id = Date.now();
    setAlerts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 5000);
  };

  const getErrorMessage = (error) =>
    error?.reason ||
    error?.error?.message ||
    error?.data?.message ||
    error?.message ||
    "알 수 없는 오류";

  const resetScanCaptureState = () => {
    stopCamera();
    setCapturedImage(null);
    setUploadFileName("");
    setCameraPermission(false);
    setIsAnalyzing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  const closeScanModal = () => {
    resetScanCaptureState();
    setScanModal((prev) => ({
      ...prev,
      open: false,
      stage: "",
      photoStep: "macro",
      progress: 0,
      macroProps: null,
      macroFingerprint: null,
      capturedMacroImage: null,
      capturedMicroImage: null,
      microProps: null,
      generatedFingerprint: "",
    }));
  };

  const resetNewProductForm = () => {
    resetScanCaptureState();
    setNewProduct({
      name: "",
      price: "",
      stock: "",
      uri: "",
      fingerprint: "",
      colorPropsMacro: null,
      colorPropsMicro: null,
    });
    setScanModal((prev) => ({
      ...prev,
      open: false,
      stage: "",
      photoStep: "macro",
      progress: 0,
      isBrandCreate: false,
      generatedFingerprint: "",
      macroProps: null,
      macroFingerprint: null,
      microProps: null,
    }));
  };

  const updateNewProductField = (field, value) => {
    setNewProduct((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "name" || field === "uri"
        ? {
            fingerprint: "",
            colorPropsMacro: null,
            colorPropsMicro: null,
          }
        : {}),
    }));
  };

  const toNumber = (value) =>
    value && typeof value.toNumber === "function" ? value.toNumber() : Number(value || 0);

  const parseProduct = (product) => ({
    id: toNumber(product.id ?? product[0]),
    name: product.name ?? product[1] ?? "",
    price: product.price ?? product[2],
    stock: product.stock ?? product[3],
    tokenURI: product.tokenURI ?? product.uri ?? product[4] ?? "",
    registeredFingerprint:
      product.registeredFingerprint ?? product.physicalFingerprint ?? product[5] ?? "",
  });

  const parseOrder = (order) => ({
    id: toNumber(order.id ?? order[0]),
    buyer: order.buyer ?? order[1] ?? "",
    productId: order.productId ?? order[2],
    productIdNumber: toNumber(order.productId ?? order[2]),
    price: order.price ?? order[3],
    status: toNumber(order.status ?? order[4]),
  });

  const parseListing = (listing) => ({
    id: toNumber(listing.id ?? listing[0]),
    seller: listing.seller ?? listing[1] ?? "",
    buyer: listing.buyer ?? listing[2] ?? "",
    tokenId: toNumber(listing.tokenId ?? listing[3]),
    price: listing.price ?? listing[4],
    status: toNumber(listing.status ?? listing[5]),
  });

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  const getTokenURIBase = (uri = "") => {
    const queryIndex = uri.indexOf("?");
    return queryIndex >= 0 ? uri.slice(0, queryIndex) : uri;
  };

  const getProductNameFromTokenURI = (uri = "") => {
    const queryIndex = uri.indexOf("?");
    if (queryIndex < 0) return "";

    try {
      const params = new URLSearchParams(uri.slice(queryIndex + 1));
      return params.get("name") || "";
    } catch (e) {
      return "";
    }
  };

  const buildProductTokenURI = (brandUri, productName) => {
    const baseUri = brandUri || "ipfs://brand/other";
    return `${baseUri}?name=${encodeURIComponent(productName)}`;
  };

  const saveNftDisplayMeta = (tokenId, meta) => {
    if (!tokenId || !meta?.name) return;
    localStorage.setItem(
      `nft_meta_${tokenId}`,
      JSON.stringify({
        name: meta.name,
        uri: meta.uri || "",
        imageEmoji: meta.imageEmoji || "",
      })
    );
  };

  const getNftDisplayMeta = (tokenId, uri = "") => {
    const stored = localStorage.getItem(`nft_meta_${tokenId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.name) {
          const fallback = mockNftMetadata(parsed.uri || uri, tokenId);
          return {
            name: parsed.name,
            imageEmoji: parsed.imageEmoji || fallback.imageEmoji,
            uri: parsed.uri || uri,
          };
        }
      } catch (e) {
        localStorage.removeItem(`nft_meta_${tokenId}`);
      }
    }

    const nameFromUri = getProductNameFromTokenURI(uri);
    if (nameFromUri) {
      const fallback = mockNftMetadata(uri, tokenId);
      return {
        name: nameFromUri,
        imageEmoji: fallback.imageEmoji,
        uri,
      };
    }

    return { ...mockNftMetadata(uri, tokenId), uri };
  };

  const clearLocalCacheForNewDeployment = (deploymentKey) => {
    const storageKey = "trustchain_active_deployment";
    if (localStorage.getItem(storageKey) === deploymentKey) return;

    const prefixesToClear = [
      "chat_",
      "chat_archived_",
      "color_prod_",
      "color_nft_",
      "nft_meta_",
    ];
    Object.keys(localStorage)
      .filter((key) => prefixesToClear.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => localStorage.removeItem(key));

    localStorage.setItem(storageKey, deploymentKey);
    setChatMessages([]);
    setActiveChatChannel(null);
  };

  // NFT 메타데이터 모의 생성
  const mockNftMetadata = (uri, tokenId) => {
    const uriProductName = getProductNameFromTokenURI(uri);
    if (uriProductName) {
      const baseUri = getTokenURIBase(uri);
      return {
        name: uriProductName,
        imageEmoji: mockNftMetadata(baseUri, tokenId).imageEmoji,
      };
    }

    const baseUri = getTokenURIBase(uri || "");
    if (baseUri.startsWith("ipfs://everyday/") && baseUri !== EVERYDAY_CATEGORY_URI) {
      const rawName = baseUri.replace("ipfs://everyday/", "");
      let decodedName = rawName || "";
      try {
        decodedName = decodeURIComponent(decodedName);
      } catch (e) {
        decodedName = rawName || "";
      }
      if (decodedName && decodedName !== "other") {
        return { name: decodedName, imageEmoji: "📦" };
      }
    }

    const items = [
      { name: "에르메스 버킨백 30", imageEmoji: "👜" },
      { name: "롤렉스 서브마리너", imageEmoji: "⌚" },
      { name: "나이키 에어 조던 1", imageEmoji: "👟" },
      { name: "루이비통 네버풀 MM", imageEmoji: "🛍️" },
      { name: "샤넬 클래식 플랩백", imageEmoji: "💼" },
      { name: "구찌 GG 마몽 백", imageEmoji: "👜" },
      { name: "프라다 사피아노 지갑", imageEmoji: "💳" },
      { name: "불가리 세르펜티 시계", imageEmoji: "⌚" },
    ];

    // 드롭다운에서 선택된 브랜드 URI 직접 매핑
    const brandUriMap = {
      "ipfs://brand/gucci":  { name: "구찌 정품", imageEmoji: "👜" },
      "ipfs://brand/hermes": { name: "에르메스 정품", imageEmoji: "👜" },
      "ipfs://brand/rolex":  { name: "롤렉스 정품", imageEmoji: "⌚" },
      "ipfs://brand/chanel": { name: "샤넬 정품", imageEmoji: "💎" },
      "ipfs://brand/other":  { name: "기타 브랜드 정품", imageEmoji: "📦" },
      [EVERYDAY_CATEGORY_URI]: { name: "기타", imageEmoji: "📦" },
    };
    if (baseUri && brandUriMap[baseUri]) return brandUriMap[baseUri];

    if (uri && uri !== "") {
      const uriLower = uri.toLowerCase();
      for (const item of items) {
        const keywords = item.name.toLowerCase().split(" ");
        if (keywords.some((kw) => uriLower.includes(kw))) {
          return item;
        }
      }
    }
    return items[tokenId % items.length];
  };

  // 블록체인 초기화
  const initBlockchain = async (currentAccount) => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const network = await provider.getNetwork();
      setNetworkName(getNetworkName(network.chainId));

      const tokenContract = new ethers.Contract(
        TrustTokenAbi.networks[network.chainId]?.address || TrustTokenAbi.networks["5777"]?.address,
        TrustTokenAbi.abi,
        signer
      );
      const nftContract = new ethers.Contract(
        AuthenticNFTAbi.networks[network.chainId]?.address || AuthenticNFTAbi.networks["5777"]?.address,
        AuthenticNFTAbi.abi,
        signer
      );
      const shopContract = new ethers.Contract(
        BrandShopAbi.networks[network.chainId]?.address || BrandShopAbi.networks["5777"]?.address,
        BrandShopAbi.abi,
        signer
      );
      const marketContract = new ethers.Contract(
        UsedMarketplaceAbi.networks[network.chainId]?.address || UsedMarketplaceAbi.networks["5777"]?.address,
        UsedMarketplaceAbi.abi,
        signer
      );

      const newContracts = {
        token: tokenContract,
        nft: nftContract,
        shop: shopContract,
        market: marketContract,
      };

      clearLocalCacheForNewDeployment(
        [
          tokenContract.address,
          nftContract.address,
          shopContract.address,
          marketContract.address,
        ].join(":")
      );

      setContracts(newContracts);
      setContractsDeployed(true);
      addLog("블록체인 연결 성공!", "success");

      await refreshBlockchainData(newContracts, currentAccount);
    } catch (error) {
      console.error("Blockchain init error:", error);
      addLog("블록체인 연결 실패: " + error.message, "danger");
    }
  };

  // 블록체인 데이터 갱신
  const refreshBlockchainData = async (contractsParam, accountParam) => {
    const c = contractsParam || contracts;
    const addr = accountParam || account;
    if (!c.token || !addr) return;

    try {
      // 1. 잔액 조회
      const bal = await c.token.balanceOf(addr);
      setBalance(ethers.utils.formatEther(bal));

      // 2. 관리자 권한 확인 (BrandShop / UsedMarketplace 소유자 여부)
      const shopOwner = await c.shop.owner();
      setOwnerAddress(shopOwner);
      const checkIsOwner = shopOwner.toLowerCase() === addr.toLowerCase();
      setIsOwner(checkIsOwner);

      // 3. 브랜드 상점 상품 목록 로드
      const pCount = await c.shop.productCount();
      const productList = [];
      const productById = new Map();
      for (let i = 1; i <= pCount.toNumber(); i++) {
        const p = parseProduct(await c.shop.products(i));
        const productId = p.id;
        if (productId > 0) {
          productById.set(productId, p);
          productList.push({
            id: productId,
            name: p.name,
            price: ethers.utils.formatEther(p.price),
            stock: toNumber(p.stock),
            uri: p.tokenURI,
            registeredFingerprint: p.registeredFingerprint,
          });
        }
      }
      setProducts(productList);

      const nftMetaByTokenId = new Map();
      try {
        const deliveryEvents = await c.shop.queryFilter(
          c.shop.filters.DeliveryConfirmed()
        );
        for (const event of deliveryEvents) {
          const tokenId = toNumber(event.args?.tokenId ?? event.args?.[2]);
          const orderId = toNumber(event.args?.orderId ?? event.args?.[0]);
          if (!tokenId || !orderId) continue;

          const deliveredOrder = parseOrder(await c.shop.orders(orderId));
          const deliveredProduct =
            productById.get(deliveredOrder.productIdNumber) ||
            parseProduct(await c.shop.products(deliveredOrder.productId));
          const deliveredSpec = mockNftMetadata(
            deliveredProduct.tokenURI,
            tokenId
          );
          const meta = {
            name: deliveredProduct.name,
            uri: deliveredProduct.tokenURI,
            imageEmoji: deliveredSpec.imageEmoji,
          };
          nftMetaByTokenId.set(tokenId, meta);
          saveNftDisplayMeta(tokenId, meta);
        }
      } catch (e) {
        console.warn("Failed to recover delivered NFT metadata:", e);
      }

      // 4. 내 NFT (보증서) 인벤토리 로드
      // AuthenticNFT는 ERC721Enumerable을 상속하지 않으므로 tokenOfOwnerByIndex를 사용할 수 없다.
      // 브랜드 발급 토큰 ID와 일상재 공개 민팅 토큰 ID 범위를 직접 확인한다.
      const nftList = [];
      const addOwnedNft = async (tokenId) => {
        try {
          const owner = await c.nft.ownerOf(tokenId);
          if (owner.toLowerCase() !== addr.toLowerCase()) return;

          const tokenUri = await c.nft.tokenURI(tokenId);
          const fingerprint = await c.nft.physicalFingerprints(tokenId);
          const nftSpec =
            nftMetaByTokenId.get(tokenId) || getNftDisplayMeta(tokenId, tokenUri);
          nftList.push({
            tokenId,
            uri: tokenUri,
            fingerprint,
            name: nftSpec.name,
            imageEmoji: nftSpec.imageEmoji,
          });
        } catch (e) {
          // tokenId가 아직 발급되지 않았거나 조회할 수 없으면 건너뛴다.
        }
      };

      let nextBrandTokenId = 1;
      try {
        nextBrandTokenId = (await c.shop.nextTokenId()).toNumber();
      } catch (e) {
        nextBrandTokenId = 1;
      }
      for (let tokenId = 1; tokenId < nextBrandTokenId; tokenId++) {
        await addOwnedNft(tokenId);
      }

      let nextPublicTokenId = 1000000;
      try {
        nextPublicTokenId = (await c.nft.nextPublicTokenId()).toNumber();
      } catch (e) {
        nextPublicTokenId = 1000000;
      }
      for (let tokenId = 1000000; tokenId < nextPublicTokenId; tokenId++) {
        await addOwnedNft(tokenId);
      }
      setMyNfts(nftList);

      // 5. 브랜드 신품 주문 내역 로드
      const oCount = await c.shop.orderCount();
      const myBrandOrdersList = [];
      for (let i = 1; i <= oCount.toNumber(); i++) {
        const order = parseOrder(await c.shop.orders(i));
        const orderStatus = order.status;
        // 내 신품 구매 주문 내역 저장 (또는 만약 브랜드 소유자라면 배송 대기 중인 모든 주문 저장)
        if (
          order.buyer.toLowerCase() === addr.toLowerCase() ||
          (checkIsOwner && orderStatus === 0)
        ) {
          const product = parseProduct(await c.shop.products(order.productId));
          myBrandOrdersList.push({
            id: order.id,
            productId: order.productIdNumber,
            productName: product.name,
            productUri: product.tokenURI,
            price: ethers.utils.formatEther(order.price),
            status: orderStatus,
            statusName: [
              "배송 중 (에스크로 잠금)",
              "수령 완료 (보증서 발급)",
              "환불 완료",
            ][orderStatus],
            registeredFingerprint: product.registeredFingerprint,
            buyer: order.buyer,
          });
        }
      }
      setMyBrandOrders(myBrandOrdersList);

      // 6. 중고 마켓플레이스 리스팅 로드
      const lCount = await c.market.listingCount();
      const activeListings = [];
      const disputedListingsList = [];
      for (let i = 1; i <= lCount.toNumber(); i++) {
        const item = parseListing(await c.market.listings(i));
        const itemStatus = item.status;
        const itemTokenId = item.tokenId;
        let itemTokenUri = "";
        let itemFingerprint = "";
        try {
          itemTokenUri = await c.nft.tokenURI(itemTokenId);
        } catch (e) {
          itemTokenUri = "";
        }
        try {
          itemFingerprint = await c.nft.physicalFingerprints(itemTokenId);
        } catch (e) {
          itemFingerprint = "";
        }
        let buyerRefundApproved = false;
        let sellerRefundApproved = false;
        if ([1, 3].includes(itemStatus)) {
          try {
            buyerRefundApproved = await c.market.buyerRefundApproved(i);
            sellerRefundApproved = await c.market.sellerRefundApproved(i);
          } catch (e) {
            buyerRefundApproved = false;
            sellerRefundApproved = false;
          }
        }
        const nftSpec = getNftDisplayMeta(itemTokenId, itemTokenUri);
        const listingData = {
          id: item.id,
          tokenId: itemTokenId,
          seller: item.seller,
          buyer: item.buyer,
          price: ethers.utils.formatEther(item.price),
          status: itemStatus,
          statusName: [
            "판매 중",
            "🔒 에스크로 잠금 (거래 진행 중)",
            "✅ 거래 완료",
            "⚠️ 분쟁 발생",
            "↩️ 환불 완료",
          ][itemStatus] || "알 수 없음",
          tokenUri: itemTokenUri,
          name: nftSpec.name,
          imageEmoji: nftSpec.imageEmoji,
          registeredFingerprint: itemFingerprint,
          buyerRefundApproved,
          sellerRefundApproved,
        };

        if ([0, 1, 2, 3].includes(itemStatus)) {
          activeListings.push(listingData);
        }
        if (itemStatus === 3) {
          // 분쟁 조정을 위해 NFT 컨트랙트에서 원래 등록된 지문 조회
          const registeredFingerprint = await c.nft.physicalFingerprints(
            itemTokenId
          );
          listingData.registeredFingerprint = registeredFingerprint;
          disputedListingsList.push({ ...listingData, registeredFingerprint });
        }
      }
      setListings(activeListings);
      setDisputedListings(disputedListingsList);

      // 7. 구매 내역 로드
      const historyList = [];
      // 브랜드 신품 구매 완료 내역
      for (let i = 1; i <= oCount.toNumber(); i++) {
        const order = parseOrder(await c.shop.orders(i));
        const orderStatus = order.status;
        if (
          order.buyer.toLowerCase() === addr.toLowerCase() &&
          orderStatus === 1
        ) {
          const product = parseProduct(await c.shop.products(order.productId));
          historyList.push({
            id: `B-${order.id}`,
            type: "brand",
            typeName: "브랜드 신품 구매",
            productName: product.name,
            price: ethers.utils.formatEther(order.price),
            sellerName: "브랜드 공식 스토어",
            status: "수령 완료 (NFT 보증서 발급)",
            badgeClass: "badge-completed",
          });
        }
      }

      // 중고거래 마켓에서 완료(Completed = 2) 및 분쟁 중(Disputed = 3)인 내역 조회
      for (let i = 1; i <= lCount.toNumber(); i++) {
        const l = parseListing(await c.market.listings(i));
        const listingStatus = l.status;
        if (l.buyer.toLowerCase() === addr.toLowerCase()) {
          let tokenUri = "";
          try {
            tokenUri = await c.nft.tokenURI(l.tokenId);
          } catch (e) {
            tokenUri = "";
          }
          const nftSpec = mockNftMetadata(tokenUri, l.tokenId);

          if (listingStatus === 2) {
            historyList.push({
              id: `M-${l.id}`,
              listingId: l.id,
              type: "secondhand",
              typeName: "중고 에스크로 거래",
              productName: nftSpec.name,
              price: ethers.utils.formatEther(l.price),
              sellerName: `${l.seller.substring(0, 6)}...${l.seller.substring(38)}`,
              status: "거래 완료 (보증서 양도)",
              badgeClass: "badge-completed",
              rawStatus: listingStatus,
              seller: l.seller,
              buyer: l.buyer,
            });
          } else if (listingStatus === 3) {
            historyList.push({
              id: `M-${l.id}`,
              listingId: l.id,
              type: "secondhand",
              typeName: "중고 에스크로 거래",
              productName: nftSpec.name,
              price: ethers.utils.formatEther(l.price),
              sellerName: `${l.seller.substring(0, 6)}...${l.seller.substring(38)}`,
              status: "⚠️ 분쟁 발생 상태 (중재 대기 중)",
              badgeClass: "badge-disputed",
              rawStatus: listingStatus,
              seller: l.seller,
              buyer: l.buyer,
            });
          }
        }
      }
      setPurchaseHistory(historyList);
    } catch (error) {
      console.error("Data refresh error:", error);
      addLog("데이터 갱신 실패: " + getErrorMessage(error), "danger");
    }
  };

  // MetaMask 연결
  const connectWallet = async () => {
    if (!window.ethereum) {
      addAlert("MetaMask가 설치되어 있지 않습니다!", "danger");
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        await initBlockchain(accounts[0]);
      }
    } catch (error) {
      addLog("지갑 연결 실패: " + error.message, "danger");
    }
  };

  // MetaMask 이벤트 리스너
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          initBlockchain(accounts[0]);
        } else {
          setAccount("");
          setContracts({ token: null, nft: null, shop: null, market: null });
        }
      });
      window.ethereum.on("chainChanged", () => {
        window.location.reload();
      });
    }
  }, []);

  // MobileNet AI 모델 로드
  useEffect(() => {
    const loadMobileNet = async () => {
      if (window.mobilenet) {
        try {
          addLog("AI 사물 분류 및 특징 추출 모델(MobileNet) 로딩 중...", "info");
          const model = await window.mobilenet.load();
          setNetModel(model);
          addLog("AI 모델 로딩 완료! 정밀 분석 준비 완료.", "success");
        } catch (err) {
          console.error("Failed to load MobileNet:", err);
          addLog("AI 모델 로딩 실패.", "danger");
        }
      }
    };
    loadMobileNet();
  }, []);

  // 실시간 채팅 폴링 및 동기화 (로컬스토리지 기반 & 블록체인 백업)
  useEffect(() => {
    if (!activeChatChannel) return;

    // 1회 초기 온체인 복구 시도
    const syncChatFromBlockchain = async () => {
      if (!contracts.market) return;
      try {
        const filter = contracts.market.filters.ChatSaved(
          activeChatChannel.listingId
        );
        const events = await contracts.market.queryFilter(filter);
        if (events && events.length > 0) {
          const latestEvent = events[events.length - 1];
          const chatData = latestEvent.args.chatData;
          if (chatData) {
            const parsedMessages = [];
            const lines = chatData.split("\n");
            for (const line of lines) {
              const match = line.match(/^\[(0x[a-fA-F0-9]+)\]:\s(.*)$/);
              if (match) {
                parsedMessages.push({
                  sender: match[1],
                  content: match[2],
                  timestamp: Date.now(),
                });
              }
            }
            if (parsedMessages.length > 0) {
              localStorage.setItem(
                "chat_" + activeChatChannel.id,
                JSON.stringify(parsedMessages)
              );
              setChatMessages(parsedMessages);
              addLog(
                `[블록체인 백업] 주문 #${activeChatChannel.listingId} 대화가 온체인에서 복구되었습니다.`,
                "success"
              );
              return;
            }
          }
        }
      } catch (err) {
        console.error("Failed to sync chat from blockchain:", err);
      }
    };

    const stored = localStorage.getItem("chat_" + activeChatChannel.id);
    if (stored) {
      setChatMessages(JSON.parse(stored));
    } else {
      syncChatFromBlockchain();
    }

    const interval = setInterval(() => {
      const currentStored = localStorage.getItem(
        "chat_" + activeChatChannel.id
      );
      if (currentStored) {
        setChatMessages(JSON.parse(currentStored));
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeChatChannel, contracts.market]);

  // 브랜드 주문 취소 및 환불 처리 (브랜드 소유자 전용)
  const cancelBrandOrder = async (orderId) => {
    if (!contracts.shop) return;
    try {
      setLoading(true);
      addLog(`브랜드 주문 #${orderId} 취소 및 에스크로 환불 진행 중...`, "info");
      const tx = await contracts.shop.cancelOrder(orderId);
      await tx.wait();
      addLog(
        `주문 #${orderId}이(가) 취소되었으며, 에스크로 대금이 구매자에게 반환되었습니다.`,
        "success"
      );
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("주문 취소 트랜잭션 실패.", "danger");
    } finally {
      setLoading(false);
    }
  };

  // 하이브리드 채팅 열기
  const openChatChannel = (
    listingId,
    type,
    title,
    sellerAddress,
    buyerAddress
  ) => {
    const channelId = `${listingId}_${type}`;
    let recipient = "";

    if (type === "trade") {
      recipient =
        account.toLowerCase() === sellerAddress.toLowerCase()
          ? buyerAddress
          : sellerAddress;
    } else if (type === "brand_seller") {
      recipient = isOwner ? sellerAddress : ownerAddress;
    } else if (type === "brand_buyer") {
      recipient = isOwner ? buyerAddress : ownerAddress;
    }

    setActiveChatChannel({
      id: channelId,
      listingId,
      type,
      title,
      sender: account,
      recipient,
      seller: sellerAddress,
      buyer: buyerAddress,
    });
    setNewChatMessage("");
  };

  // 실시간 메시지 전송
  const sendChatMessage = () => {
    if (!newChatMessage.trim() || !activeChatChannel || !account) return;
    const channelId = activeChatChannel.id;
    const stored = localStorage.getItem("chat_" + channelId);
    const messages = stored ? JSON.parse(stored) : [];

    const newMsg = {
      sender: account,
      content: newChatMessage,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, newMsg];
    localStorage.setItem("chat_" + channelId, JSON.stringify(updatedMessages));
    setChatMessages(updatedMessages);
    setNewChatMessage("");
  };

  // 대화 기록을 온체인 블록체인 트랜잭션으로 영구 기록 (대화 종료)
  const saveChatToBlockchain = async () => {
    if (!contracts.market || !activeChatChannel) return;
    try {
      setIsArchivingChat(true);
      addLog(`대화 내용을 블록체인에 영구 기록 중...`, "info");

      const channelId = activeChatChannel.id;
      const stored = localStorage.getItem("chat_" + channelId);
      const messages = stored ? JSON.parse(stored) : [];

      if (messages.length === 0) {
        addLog("기록할 대화 내용이 없습니다.", "warning");
        setIsArchivingChat(false);
        return;
      }

      const formattedChat = messages
        .map((m) => `[${m.sender}]: ${m.content}`)
        .join("\n");

      const tx = await contracts.market.saveChatHistory(
        activeChatChannel.listingId,
        formattedChat
      );
      await tx.wait();

      addLog(
        `대화가 온체인 트랜잭션 로그(ChatSaved)에 영구 보존되었습니다!`,
        "success"
      );
      localStorage.setItem(`chat_archived_${channelId}`, "true");
    } catch (error) {
      console.error(error);
      addLog("대화 온체인 저장 트랜잭션 실패.", "danger");
    } finally {
      setIsArchivingChat(false);
    }
  };

  // 브랜드 상품 구매
  const buyProduct = async (productId, priceEther) => {
    if (!contracts.shop || !contracts.token) return;
    try {
      setLoading(true);
      addLog(`상품 #${productId} 구매 진행 중...`, "info");
      const priceInWei = ethers.utils.parseEther(priceEther);
      const allowanceTx = await contracts.token.approve(
        contracts.shop.address,
        priceInWei
      );
      await allowanceTx.wait();
      const tx = await contracts.shop.buyProduct(productId);
      await tx.wait();
      addLog(
        "신품 구매 완료! TT가 에스크로에 동결되었습니다. 아래 주문 대기 내역에서 실물 수령 후 확인을 진행하세요.",
        "success"
      );
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("구매 실패: " + getErrorMessage(error), "danger");
    } finally {
      setLoading(false);
    }
  };

  const removeBrandProduct = async (productId, productName) => {
    if (!contracts.shop) return;
    if (!isOwner) {
      addAlert("브랜드 관리자만 상품을 삭제할 수 있습니다.", "warning");
      return;
    }

    const confirmed = window.confirm(
      `"${productName}" 상품을 삭제하시겠습니까?`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      addLog(`상품 #${productId} 삭제 트랜잭션 처리 중...`, "warning");
      const tx = await contracts.shop.removeProduct(productId);
      await tx.wait();
      localStorage.removeItem(`color_prod_${productId}_macro`);
      localStorage.removeItem(`color_prod_${productId}_micro`);
      addLog(`"${productName}" 상품이 삭제되었습니다.`, "success");
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("상품 삭제 실패: " + error.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // 브랜드 신품 배송 수령 확인 스캔 시작
  const startBrandOrderDeliveryScan = (order) => {
    resetScanCaptureState();
    setScanModal({
      open: true,
      stage: "camera_feed",
      photoStep: "macro",
      progress: 0,
      isBrandCreate: false,
      isEverydayCreate: false,
      brandOrder: order,
      listing: null,
      productName: order.productName,
      macroProps: null,
      macroFingerprint: null,
      capturedMacroImage: null,
      capturedMicroImage: null,
      microProps: null,
      generatedFingerprint: "",
    });
    addLog(`신품 수령 확인 스캔 시작: ${order.productName}`, "info");
  };

  // 신품 배송 수령 확인 (정산 release 및 NFT 민팅)
  const confirmBrandOrderDelivery = async (orderId) => {
    if (!contracts.shop || !account) return;
    try {
      setLoading(true);

      const order = parseOrder(await contracts.shop.orders(orderId));
      const orderStatus = order.status;
      if (order.buyer.toLowerCase() !== account.toLowerCase()) {
        addAlert("수령 확인은 해당 상품을 구매한 지갑에서만 가능합니다.", "warning");
        addLog("신품 수령 확인 중단: 현재 지갑이 주문 구매자가 아닙니다.", "warning");
        return;
      }
      if (orderStatus !== 0) {
        addAlert("이미 처리되었거나 활성 상태가 아닌 주문입니다.", "warning");
        addLog(`신품 수령 확인 중단: 주문 상태가 Active가 아닙니다. status=${orderStatus}`, "warning");
        return;
      }

      addLog(`주문 #${orderId} 수령 확인 및 에스크로 정산 진행 중...`, "info");
      const tx = await contracts.shop.confirmDelivery(orderId);
      const receipt = await tx.wait();
      const deliveryEvent = receipt.events?.find(
        (event) => event.event === "DeliveryConfirmed"
      );
      let mintedTokenId = toNumber(
        deliveryEvent?.args?.tokenId ?? deliveryEvent?.args?.[2]
      );
      if (!mintedTokenId) {
        try {
          mintedTokenId = (await contracts.shop.nextTokenId()).toNumber() - 1;
        } catch (e) {
          mintedTokenId = 0;
        }
      }
      const orderForMeta = myBrandOrders.find((o) => o.id === orderId);
      if (mintedTokenId && orderForMeta?.productName) {
        const spec = mockNftMetadata(orderForMeta.productUri || "", mintedTokenId);
        saveNftDisplayMeta(mintedTokenId, {
          name: orderForMeta.productName,
          uri: orderForMeta.productUri || "",
          imageEmoji: spec.imageEmoji,
        });
      }
      addLog(
        "수령 확인 완료! 에스크로 대금이 브랜드로 송금되었으며, 디지털 정품 보증서(NFT)가 지갑으로 전송되었습니다.",
        "success"
      );
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("신품 수령 확인 실패: " + getErrorMessage(error), "danger");
    } finally {
      setLoading(false);
    }
  };

  // 중고 마켓플레이스에 NFT 등록
  const listNftForSale = async (tokenId, priceEther) => {
    if (!contracts.nft || !contracts.market) return;
    try {
      setLoading(true);
      const priceWei = ethers.utils.parseEther(priceEther);
      addLog(`NFT #${tokenId}를 중고 마켓에 등록 중...`, "info");
      const approveTx = await contracts.nft.approve(
        contracts.market.address,
        tokenId
      );
      await approveTx.wait();
      const tx = await contracts.market.listUsedItem(tokenId, priceWei);
      await tx.wait();
      addLog("중고 마켓 등록 완료!", "success");
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("등록 실패: " + error.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // 중고품 구매 (에스크로)
  const buyUsedItem = async (listingId, priceEther) => {
    if (!contracts.market || !contracts.token || !account) return;
    try {
      setLoading(true);
      addLog(`중고품 #${listingId} 에스크로 구매 진행 중...`, "info");
      const priceWei = ethers.utils.parseEther(priceEther);
      const listing = parseListing(await contracts.market.listings(listingId));
      if (listing.seller.toLowerCase() === account.toLowerCase()) {
        addAlert("본인이 등록한 상품은 구매할 수 없습니다.", "warning");
        addLog("중고품 구매 중단: 판매자와 구매자 지갑이 같습니다.", "warning");
        return;
      }

      const buyerBalance = await contracts.token.balanceOf(account);
      if (buyerBalance.lt(priceWei)) {
        addAlert("TT 잔액이 부족합니다. 먼저 TT를 충전해주세요.", "warning");
        addLog(
          `구매 실패: TT 잔액 부족 (필요 ${priceEther} TT, 보유 ${ethers.utils.formatEther(buyerBalance)} TT)`,
          "danger"
        );
        return;
      }

      const approveTx = await contracts.token.approve(
        contracts.market.address,
        priceWei
      );
      await approveTx.wait();
      const tx = await contracts.market.buyUsedItem(listingId);
      await tx.wait();
      addLog(
        "구매 완료! 에스크로에 대금이 동결되었습니다. 실물 확인 후 수령 완료를 눌러주세요.",
        "success"
      );
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("구매 실패: " + getErrorMessage(error), "danger");
    } finally {
      setLoading(false);
    }
  };

  // 중고품 판매 등록 취소 (판매자 전용)
  const cancelUsedListing = async (listingId, itemName = "중고 상품") => {
    if (!contracts.market || !account) return;

    try {
      const listing = parseListing(await contracts.market.listings(listingId));
      if (listing.status !== 0) {
        addAlert("판매 중인 중고 상품만 등록 취소할 수 있습니다.", "warning");
        addLog("중고 판매 취소 중단: 이미 구매 또는 종료된 상품입니다.", "warning");
        return;
      }

      if (listing.seller.toLowerCase() !== account.toLowerCase()) {
        addAlert("상품을 올린 판매자만 등록 취소할 수 있습니다.", "warning");
        addLog("중고 판매 취소 중단: 현재 지갑이 판매자와 다릅니다.", "warning");
        return;
      }

      const confirmed = window.confirm(
        `"${itemName}" 중고 판매 등록을 취소하시겠습니까?`
      );
      if (!confirmed) return;

      setLoading(true);
      addLog(`중고품 #${listingId} 판매 등록 취소 처리 중...`, "warning");
      const tx = await contracts.market.cancelUsedListing(listingId);
      await tx.wait();
      addLog(
        `"${itemName}" 중고 판매 등록이 취소되었습니다. NFT가 판매자 지갑으로 반환되었습니다.`,
        "success"
      );
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("중고 판매 취소 실패: " + getErrorMessage(error), "danger");
    } finally {
      setLoading(false);
    }
  };

  // 중고품 에스크로 거래 취소/환불 동의 (구매자와 판매자 모두 동의 시 실행)
  const approveUsedRefund = async (listingId, itemName = "중고 상품") => {
    if (!contracts.market || !account) return;

    try {
      const listing = parseListing(await contracts.market.listings(listingId));
      if (![1, 3].includes(listing.status)) {
        addAlert("에스크로 진행 중이거나 분쟁 중인 거래만 취소할 수 있습니다.", "warning");
        addLog("중고 거래 취소 중단: 환불 동의가 가능한 상태가 아닙니다.", "warning");
        return;
      }

      const isBuyer = listing.buyer.toLowerCase() === account.toLowerCase();
      const isSeller = listing.seller.toLowerCase() === account.toLowerCase();
      if (!isBuyer && !isSeller) {
        addAlert("거래 당사자만 취소/환불에 동의할 수 있습니다.", "warning");
        addLog("중고 거래 취소 중단: 현재 지갑이 거래 당사자가 아닙니다.", "warning");
        return;
      }

      const buyerApproved = await contracts.market.buyerRefundApproved(listingId);
      const sellerApproved = await contracts.market.sellerRefundApproved(listingId);
      const alreadyApproved = isBuyer ? buyerApproved : sellerApproved;
      const counterpartApproved = isBuyer ? sellerApproved : buyerApproved;

      if (alreadyApproved) {
        addAlert("이미 취소/환불에 동의한 거래입니다.", "info");
        return;
      }

      const confirmed = window.confirm(
        counterpartApproved
          ? `"${itemName}" 거래를 최종 취소하시겠습니까?\nTT는 구매자에게, NFT는 판매자에게 반환됩니다.`
          : `"${itemName}" 거래 취소/환불에 동의하시겠습니까?\n상대방도 동의하면 자동으로 취소됩니다.`
      );
      if (!confirmed) return;

      setLoading(true);
      addLog(`중고품 #${listingId} 취소/환불 동의 트랜잭션 처리 중...`, "warning");
      const tx = await contracts.market.approveRefund(listingId);
      await tx.wait();

      if (counterpartApproved) {
        addLog(
          `"${itemName}" 거래가 취소되었습니다. TT는 구매자에게, NFT는 판매자에게 반환되었습니다.`,
          "success"
        );
      } else {
        addLog(
          `"${itemName}" 거래 취소/환불 동의가 저장되었습니다. 상대방 동의를 기다립니다.`,
          "info"
        );
      }
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("중고 거래 취소/환불 동의 실패: " + getErrorMessage(error), "danger");
    } finally {
      setLoading(false);
    }
  };

  // 중고품 배송 수령 스캔 시작
  const startDeliveryScan = (listing) => {
    resetScanCaptureState();
    setScanModal({
      open: true,
      stage: "camera_feed",
      photoStep: "macro",
      progress: 0,
      isBrandCreate: false,
      isEverydayCreate: false,
      brandOrder: null,
      listing,
      productName: listing.name || "중고 상품",
      macroProps: null,
      macroFingerprint: null,
      capturedMacroImage: null,
      capturedMicroImage: null,
      microProps: null,
      generatedFingerprint: "",
    });
    addLog(`배송 수령 확인 스캔 시작`, "info");
  };

  // 배송 수령 확인 (에스크로 해제)
  const confirmDelivery = async (listingId) => {
    if (!contracts.market) return;
    try {
      setLoading(true);
      addLog(
        `거래 #${listingId} 배송 수령 확인 및 에스크로 정산 중...`,
        "info"
      );

      const tx = await contracts.market.confirmDelivery(listingId);
      await tx.wait();

      addLog(
        "거래가 최종 정산되었습니다! 에스크로 해제: 3% 브랜드 로열티와 97% 판매자 수익이 자동 분배되었으며, NFT가 회원님의 지갑으로 전송되었습니다.",
        "success"
      );
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("배송 수령 확인 실패.", "danger");
    } finally {
      setLoading(false);
    }
  };

  // 분쟁 제기
  const raiseDispute = async (listingId, scannedFingerprint) => {
    if (!contracts.market) return;
    try {
      setLoading(true);
      addLog(
        `스캔된 지문 증거를 토대로 거래 #${listingId}에 대한 분쟁을 제기하는 중...`,
        "warning"
      );
      const tx = await contracts.market.raiseDispute(
        listingId,
        scannedFingerprint
      );
      await tx.wait();
      addLog(
        `분쟁이 제기되었습니다. 에스크로가 동결되며 브랜드 중재자가 조정을 시작합니다.`,
        "warning"
      );
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("분쟁 제기 실패.", "danger");
    } finally {
      setLoading(false);
    }
  };

  // 분쟁 해결 (브랜드 관리자 전용)
  const resolveDispute = async (listingId, refundBuyer) => {
    if (!contracts.market) return;
    try {
      setLoading(true);
      addLog(
        `거래 #${listingId} 분쟁 해결 중... ${refundBuyer ? "구매자에게 환불" : "판매자에게 대금 지급"}`,
        "info"
      );
      const tx = await contracts.market.resolveDispute(listingId, refundBuyer);
      await tx.wait();
      addLog("분쟁이 해결되었습니다!", "success");
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("분쟁 해결 실패.", "danger");
    } finally {
      setLoading(false);
    }
  };

  // 브랜드 신규 상품 생성 스캔 시작
  const startBrandProductScan = () => {
    resetScanCaptureState();
    setScanModal({
      open: true,
      stage: "camera_feed",
      photoStep: "macro",
      progress: 0,
      isBrandCreate: true,
      isEverydayCreate: false,
      brandOrder: null,
      listing: null,
      productName: newProduct.name || "신규 상품",
      macroProps: null,
      macroFingerprint: null,
      capturedMacroImage: null,
      capturedMicroImage: null,
      microProps: null,
      generatedFingerprint: "",
    });
  };

  // 일반 일상재 등록 스캔 시작
  const startEverydayItemScan = () => {
    resetScanCaptureState();
    setScanModal({
      open: true,
      stage: "camera_feed",
      photoStep: "macro",
      progress: 0,
      isBrandCreate: false,
      isEverydayCreate: true,
      brandOrder: null,
      listing: null,
      productName: everydayItem.name || "일상재",
      macroProps: null,
      macroFingerprint: null,
      capturedMacroImage: null,
      capturedMicroImage: null,
      microProps: null,
      generatedFingerprint: "",
    });
  };

  // 브랜드 상품 등록
  const addBrandProduct = async () => {
    if (!contracts.shop) return;
    if (
      !newProduct.name ||
      !newProduct.price ||
      !newProduct.stock ||
      !newProduct.fingerprint
    ) {
      addAlert(
        "상품명, 가격, 재고, 지문 정보를 모두 입력하고 스캔을 완료해주세요.",
        "warning"
      );
      return;
    }
    try {
      setLoading(true);
      addLog("브랜드 신규 상품 등록 중...", "info");
      const priceInWei = ethers.utils.parseEther(newProduct.price);
      const productTokenURI = buildProductTokenURI(
        newProduct.uri || "ipfs://brand/other",
        newProduct.name
      );
      const tx = await contracts.shop.addProduct(
        newProduct.name,
        priceInWei,
        newProduct.stock,
        productTokenURI,
        newProduct.fingerprint
      );
      await tx.wait();

      const newProdId = await contracts.shop.productCount();
      if (newProduct.colorPropsMacro)
        localStorage.setItem(
          `color_prod_${newProdId.toNumber()}_macro`,
          newProduct.colorPropsMacro
        );
      if (newProduct.colorPropsMicro)
        localStorage.setItem(
          `color_prod_${newProdId.toNumber()}_micro`,
          newProduct.colorPropsMicro
        );

      addLog("상품 등록 완료!", "success");
      resetNewProductForm();
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("상품 등록 실패: " + error.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // 일상재 NFT 민팅 및 중고 마켓 등록
  const mintAndListEverydayItem = async () => {
    if (!contracts.market || !contracts.token) return;
    if (
      !everydayItem.name ||
      !everydayItem.price ||
      !everydayItem.fingerprint
    ) {
      addAlert(
        "상품명, 가격, 지문 정보를 모두 입력하고 스캔을 완료해주세요.",
        "warning"
      );
      return;
    }
    try {
      setLoading(true);
      addLog("일상재 NFT 민팅 및 중고 마켓 등록 중...", "info");
      const priceWei = ethers.utils.parseEther(everydayItem.price);
      const tokenURI = buildProductTokenURI(
        EVERYDAY_CATEGORY_URI,
        everydayItem.name
      );

      // 단일 트랜잭션 호출
      const tx = await contracts.market.mintAndListUsedItem(
        tokenURI,
        everydayItem.fingerprint,
        priceWei
      );
      await tx.wait();

      const newListingId = await contracts.market.listingCount();
      const listingData = await contracts.market.listings(newListingId);
      const mintedTokenId = listingData.tokenId.toNumber();
      const everydaySpec = mockNftMetadata(tokenURI, mintedTokenId);
      saveNftDisplayMeta(mintedTokenId, {
        name: everydayItem.name,
        uri: tokenURI,
        imageEmoji: everydaySpec.imageEmoji,
      });
      if (everydayItem.colorPropsMacro)
        localStorage.setItem(
          `color_nft_${mintedTokenId}_macro`,
          everydayItem.colorPropsMacro
        );
      if (everydayItem.colorPropsMicro)
        localStorage.setItem(
          `color_nft_${mintedTokenId}_micro`,
          everydayItem.colorPropsMicro
        );

      addLog("일상재 NFT 민팅 및 마켓 등록 완료!", "success");
      setEverydayItem({
        name: "",
        price: "",
        uri: EVERYDAY_CATEGORY_URI,
        fingerprint: "",
        colorPropsMacro: null,
        colorPropsMicro: null,
      });
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("등록 실패: " + error.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // TT 충전 결제 데모: 실제 결제 연동 전까지는 테스트 발급 함수로 잔액을 충전한다.
  const purchaseTrustTokens = async () => {
    if (!contracts.token || !account) return;

    if (!selectedPaymentMethod) {
      addAlert("결제 수단을 선택해주세요.", "warning");
      return;
    }

    const amount = String(selectedTopUpAmount);
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      addAlert("충전할 TT 수량을 올바르게 입력해주세요.", "warning");
      return;
    }

    try {
      setLoading(true);
      addLog(`결제 요청 처리 중... ${amount} TT 충전`, "info");
      const tx = await contracts.token.mint(
        account,
        ethers.utils.parseEther(amount)
      );
      await tx.wait();
      addLog(`결제 승인 처리 완료! ${amount} TT가 지갑에 충전되었습니다.`, "success");
      setPaymentModalOpen(false);
      await refreshBlockchainData();
    } catch (error) {
      console.error(error);
      addLog("TT 충전 실패: " + error.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // ===== 카메라 관련 함수들 =====
  const startCamera = async () => {
    try {
      setCameraPermission(true);
      setCapturedImage(null);
      setUploadFileName("");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      addLog("카메라 접근 실패. 파일 업로드를 사용해주세요.", "warning");
      setCameraPermission(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const captureFrame = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      addAlert("카메라 화면을 찾을 수 없습니다. 카메라를 다시 시작해주세요.", "warning");
      return null;
    }
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      addAlert("카메라 영상이 아직 준비되지 않았습니다. 잠시 후 다시 촬영해주세요.", "warning");
      return null;
    }
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedImage(imageData);
    stopCamera();
    return imageData;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        setCapturedImage(ev.target.result);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const drawImageDataToCanvas = (imageData) =>
    new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageData) {
        reject(new Error("Canvas or image data is missing"));
        return;
      }

      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error("Failed to load captured image"));
      img.src = imageData;
    });

  // 색상 및 특징 추출
  const extractColorProps = (canvas) => {
    try {
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let rSum = 0, gSum = 0, bSum = 0, pixelCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        pixelCount++;
      }
      const r = rSum / pixelCount;
      const g = gSum / pixelCount;
      const b = bSum / pixelCount;
      const brightness = (r + g + b) / 3;
      return { r, g, b, brightness };
    } catch (err) {
      return { r: 128, g: 128, b: 128, brightness: 128 };
    }
  };

  // 퍼셉추얼 해시 (Average Hash)
  const calculatePerceptualHash = (canvas) => {
    try {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = 8;
      tempCanvas.height = 8;
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.drawImage(canvas, 0, 0, 8, 8);
      const data = tempCtx.getImageData(0, 0, 8, 8).data;
      const grays = [];
      for (let i = 0; i < data.length; i += 4) {
        grays.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      const avg = grays.reduce((a, b) => a + b, 0) / grays.length;
      return grays.map((g) => (g >= avg ? 1 : 0)).join("");
    } catch (err) {
      return "0".repeat(64);
    }
  };

  // 코사인 유사도(Cosine Similarity) 계산
  const calculateCosineSimilarity = (vecA, vecB) => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  // 스캔 분석 실행
  const runScanAnalysis = async (currentProps, filename) => {
    setIsAnalyzing(true);
    setScanModal((prev) => ({
      ...prev,
      stage: "scanning",
      progress: 0,
    }));

    // MobileNet 특징 추출
    let featuresArray = [];
    if (netModel) {
      try {
        const canvas = canvasRef.current;
        const embeddingTensor = netModel.infer(canvas, true);
        const data = await embeddingTensor.data();
        featuresArray = Array.from(data);
        embeddingTensor.dispose();
      } catch (err) {
        console.error("Failed to extract features:", err);
      }
    }

    const lowerName = (filename || "").toLowerCase();
    let stepCounterfeit =
      lowerName.includes("fake") ||
      lowerName.includes("replica") ||
      lowerName.includes("copy") ||
      lowerName.includes("brick") ||
      lowerName.includes("counterfeit") ||
      currentProps.brightness < 55;

    if (scanModal.photoStep === "macro") {
      addLog("[1단계] 전체 사진 형태 및 객체 분류 중...", "info");

      // MobileNet 품목 분류 검증
      if (netModel) {
        try {
          addLog("AI 분석 시작: 사물 분류 및 형태 검증 중...", "info");
          const canvas = canvasRef.current;
          const predictions = await netModel.classify(canvas);

          if (predictions && predictions.length > 0) {
            const topPreds = predictions
              .slice(0, 2)
              .map((p) => `${p.className} (${(p.probability * 100).toFixed(1)}%)`)
              .join(", ");
            addLog(`AI 인식 품목: [${topPreds}]`, "success");

            const classifiedLabel = predictions[0].className.toLowerCase();
            const lowerProdName = scanModal.productName.toLowerCase();
            let keywordMatch = false;

            if (
              lowerProdName.includes("bag") ||
              lowerProdName.includes("가방") ||
              lowerProdName.includes("백")
            ) {
              if (
                classifiedLabel.includes("bag") ||
                classifiedLabel.includes("purse") ||
                classifiedLabel.includes("wallet") ||
                classifiedLabel.includes("backpack")
              )
                keywordMatch = true;
            } else if (
              lowerProdName.includes("rolex") ||
              lowerProdName.includes("watch") ||
              lowerProdName.includes("시계")
            ) {
              if (
                classifiedLabel.includes("watch") ||
                classifiedLabel.includes("clock")
              )
                keywordMatch = true;
            } else if (
              lowerProdName.includes("jordan") ||
              lowerProdName.includes("shoe") ||
              lowerProdName.includes("신발") ||
              lowerProdName.includes("sneaker")
            ) {
              if (
                classifiedLabel.includes("shoe") ||
                classifiedLabel.includes("sneaker") ||
                classifiedLabel.includes("boot")
              )
                keywordMatch = true;
            } else {
              keywordMatch = true;
            }

            if (!keywordMatch) {
              addLog(
                `경고: 스캔된 사물이 상품 종류와 다릅니다! (인식: ${predictions[0].className})`,
                "danger"
              );
              stepCounterfeit = true;
            }
          }
        } catch (err) {
          console.error("TFJS / MobileNet inference failed", err);
        }
      }

      // 매크로 색상 비교 (검증 모드)
      if (!scanModal.isBrandCreate && !scanModal.isEverydayCreate) {
        let registeredMacroColor = null;
        if (scanModal.brandOrder) {
          const stored = localStorage.getItem(
            `color_prod_${scanModal.brandOrder.productId}_macro`
          );
          if (stored) registeredMacroColor = JSON.parse(stored);
        } else if (scanModal.listing) {
          const stored = localStorage.getItem(
            `color_nft_${scanModal.listing.tokenId}_macro`
          );
          if (stored) registeredMacroColor = JSON.parse(stored);
        }

        if (registeredMacroColor) {
          if (registeredMacroColor.features && featuresArray.length > 0) {
            const similarity = calculateCosineSimilarity(
              registeredMacroColor.features,
              featuresArray
            );
            addLog(
              `[1단계] 거시적 형태 유사도 분석: ${(similarity * 100).toFixed(2)}% 일치 (기준치: 82.00%)`,
              "info"
            );
            if (similarity < 0.82) {
              addLog(
                `경고: 형태 유사도가 기준치(0.82) 미만입니다. (유사도: ${similarity.toFixed(4)})`,
                "danger"
              );
              stepCounterfeit = true;
            } else {
              addLog(
                `[1단계] 형태 유사도 일치! (유사도: ${similarity.toFixed(4)})`,
                "success"
              );
            }
          } else {
            // Fallback: 색상 거리 비교
            const diffR = Math.abs(registeredMacroColor.r - currentProps.r);
            const diffG = Math.abs(registeredMacroColor.g - currentProps.g);
            const diffB = Math.abs(registeredMacroColor.b - currentProps.b);
            const diffBrightness = Math.abs(
              registeredMacroColor.brightness - currentProps.brightness
            );
            const colorDistance = Math.sqrt(
              diffR * diffR + diffG * diffG + diffB * diffB
            );
            addLog(
              `[1단계 Fallback] 색상 오차: ${colorDistance.toFixed(1)}, 반사율 오차: ${diffBrightness.toFixed(1)}`,
              "info"
            );
            if (colorDistance > 45 || diffBrightness > 35) {
              addLog(
                `경고: 전체 색상 및 반사율이 일치하지 않습니다. (오차 초과)`,
                "danger"
              );
              stepCounterfeit = true;
            }
          }
        }
      }

      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        setScanModal((prev) => ({
          ...prev,
          progress: Math.min(progress, 100),
        }));

        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsAnalyzing(false);
            setCapturedImage(null);
            setUploadFileName("");

            setScanModal((prev) => ({
              ...prev,
              stage: "camera_feed",
              photoStep: "micro",
              capturedMacroImage: null,
              macroProps: { ...currentProps, features: featuresArray },
              macroFingerprint: stepCounterfeit ? "fail" : "pass",
            }));

            addLog(
              "1단계 전체 사진 촬영이 성공적으로 완료되었습니다! 이제 2단계 초근접 질감 촬영을 진행하세요.",
              "success"
            );
            if (cameraPermission) {
              startCamera();
            }
          }, 300);
        }
      }, 150);
    } else {
      // photoStep === "micro"
      addLog("[2단계] 초근접 질감/패턴 분석 중...", "info");

      // 마이크로 색상 비교 (검증 모드)
      if (!scanModal.isBrandCreate && !scanModal.isEverydayCreate) {
        let registeredMicroColor = null;
        if (scanModal.brandOrder) {
          const stored = localStorage.getItem(
            `color_prod_${scanModal.brandOrder.productId}_micro`
          );
          if (stored) registeredMicroColor = JSON.parse(stored);
        } else if (scanModal.listing) {
          const stored = localStorage.getItem(
            `color_nft_${scanModal.listing.tokenId}_micro`
          );
          if (stored) registeredMicroColor = JSON.parse(stored);
        }

        if (registeredMicroColor) {
          if (registeredMicroColor.features && featuresArray.length > 0) {
            const similarity = calculateCosineSimilarity(
              registeredMicroColor.features,
              featuresArray
            );
            addLog(
              `[2단계] 초근접 질감 유사도 분석: ${(similarity * 100).toFixed(2)}% 일치 (기준치: 82.00%)`,
              "info"
            );
            if (similarity < 0.82) {
              addLog(
                `경고: 질감 유사도가 기준치(0.82) 미만입니다. (유사도: ${similarity.toFixed(4)})`,
                "danger"
              );
              stepCounterfeit = true;
            } else {
              addLog(
                `[2단계] 질감 유사도 일치! (유사도: ${similarity.toFixed(4)})`,
                "success"
              );
            }
          } else {
            // Fallback: 색상 거리 비교
            const diffR = Math.abs(registeredMicroColor.r - currentProps.r);
            const diffG = Math.abs(registeredMicroColor.g - currentProps.g);
            const diffB = Math.abs(registeredMicroColor.b - currentProps.b);
            const diffBrightness = Math.abs(
              registeredMicroColor.brightness - currentProps.brightness
            );
            const colorDistance = Math.sqrt(
              diffR * diffR + diffG * diffG + diffB * diffB
            );
            addLog(
              `[2단계 Fallback] 미세 질감 색상 오차: ${colorDistance.toFixed(1)}, 반사율 오차: ${diffBrightness.toFixed(1)}`,
              "info"
            );
            if (colorDistance > 45 || diffBrightness > 35) {
              addLog(
                `경고: 미세 질감/원단 패턴이 일치하지 않습니다. (오차 초과)`,
                "danger"
              );
              stepCounterfeit = true;
            }
          }
        }
      }

      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        setScanModal((prev) => ({
          ...prev,
          progress: Math.min(progress, 100),
        }));

        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsAnalyzing(false);
            stopCamera();

            const isOverallCounterfeit =
              scanModal.macroFingerprint === "fail" || stepCounterfeit;

            if (scanModal.isBrandCreate) {
              // 브랜드 신규 상품 등록 단계 스캔 성공
              const pufMacro =
                "puf_macro_" +
                scanModal.productName
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, "_") +
                "_" +
                Math.floor(1000 + Math.random() * 9000);
              const pufMicro =
                "puf_micro_" +
                scanModal.productName
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, "_") +
                "_" +
                Math.floor(1000 + Math.random() * 9000);
              const combinedPuf = `${pufMacro}:${pufMicro}`;

              // 색상 정보를 임시 등록 구조에 추가
              setNewProduct((prev) => ({
                ...prev,
                colorPropsMacro: JSON.stringify(scanModal.macroProps),
                colorPropsMicro: JSON.stringify({
                  ...currentProps,
                  features: featuresArray,
                }),
                fingerprint: combinedPuf,
              }));

              setScanModal((prev) => ({
                ...prev,
                stage: "success",
                capturedMicroImage: null,
                microProps: { ...currentProps, features: featuresArray },
                generatedFingerprint: combinedPuf,
              }));
            } else if (scanModal.isEverydayCreate) {
              // 일반 일상재 신규 상품 등록 단계 스캔 성공
              const pufMacro =
                "puf_macro_everyday_" +
                scanModal.productName
                  .toLowerCase()
                  .replace(/[^a-zA-Z0-9가-힣]/g, "_") +
                "_" +
                Math.floor(1000 + Math.random() * 9000);
              const pufMicro =
                "puf_micro_everyday_" +
                scanModal.productName
                  .toLowerCase()
                  .replace(/[^a-zA-Z0-9가-힣]/g, "_") +
                "_" +
                Math.floor(1000 + Math.random() * 9000);
              const combinedPuf = `${pufMacro}:${pufMicro}`;

              // 색상 정보를 임시 등록 구조에 추가
              setEverydayItem((prev) => ({
                ...prev,
                colorPropsMacro: JSON.stringify(scanModal.macroProps),
                colorPropsMicro: JSON.stringify({
                  ...currentProps,
                  features: featuresArray,
                }),
                fingerprint: combinedPuf,
              }));

              setScanModal((prev) => ({
                ...prev,
                stage: "success",
                capturedMicroImage: null,
                microProps: { ...currentProps, features: featuresArray },
                generatedFingerprint: combinedPuf,
              }));
            } else if (scanModal.brandOrder) {
              // 브랜드 신품 배송 인수확인 시 지문 대조
              if (!isOverallCounterfeit) {
                setScanModal((prev) => ({
                  ...prev,
                  stage: "delivery_success",
                  capturedMicroImage: null,
                  microProps: { ...currentProps, features: featuresArray },
                  generatedFingerprint:
                    prev.brandOrder.registeredFingerprint,
                }));
              } else {
                const mismatchHash =
                  "puf_macro_replica_mismatch:puf_micro_replica_mismatch";
                setScanModal((prev) => ({
                  ...prev,
                  stage: "delivery_fail",
                  capturedMicroImage: null,
                  microProps: { ...currentProps, features: featuresArray },
                  generatedFingerprint: mismatchHash,
                }));
              }
            } else if (scanModal.listing) {
              // 중고 검증 및 배송 확인 시 지문 대조
              if (!isOverallCounterfeit) {
                setScanModal((prev) => ({
                  ...prev,
                  stage: "delivery_success",
                  capturedMicroImage: null,
                  microProps: { ...currentProps, features: featuresArray },
                  generatedFingerprint: prev.listing.registeredFingerprint,
                }));
              } else {
                const mismatchHash =
                  "puf_macro_replica_mismatch:puf_micro_replica_mismatch";
                setScanModal((prev) => ({
                  ...prev,
                  stage: "delivery_fail",
                  capturedMicroImage: null,
                  microProps: { ...currentProps, features: featuresArray },
                  generatedFingerprint: mismatchHash,
                }));
              }
            }
          }, 300);
        }
      }, 150);
    }
  };

  const handleScanCapture = async () => {
    if (isAnalyzing) return;

    let imageForAnalysis = capturedImage;
    if (!imageForAnalysis && cameraPermission) {
      imageForAnalysis = captureFrame();
    }

    if (!imageForAnalysis) {
      addAlert("먼저 카메라를 시작하거나 파일을 업로드해주세요.", "warning");
      return;
    }

    try {
      const canvas = await drawImageDataToCanvas(imageForAnalysis);
      const props = extractColorProps(canvas);
      await runScanAnalysis(props, uploadFileName);
    } catch (error) {
      console.error("Scan preparation failed:", error);
      addAlert("촬영 이미지를 분석할 수 없습니다. 다시 촬영하거나 다른 파일을 업로드해주세요.", "danger");
    }
  };

  // ===== 렌더링 =====
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: "'Inter', 'Outfit', sans-serif",
      }}
    >
      {/* 알림 배너 */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`alert alert-${alert.type}`}
            style={{
              padding: "12px 20px",
              borderRadius: "10px",
              background:
                alert.type === "danger"
                  ? "rgba(255,23,68,0.15)"
                  : "rgba(255,193,7,0.15)",
              border: `1px solid ${alert.type === "danger" ? "var(--danger)" : "var(--warning)"}`,
              color:
                alert.type === "danger" ? "var(--danger)" : "var(--warning)",
              fontSize: "14px",
              fontWeight: "600",
              maxWidth: "350px",
              animation: "slideIn 0.3s ease",
            }}
          >
            {alert.message}
          </div>
        ))}
      </div>

      {/* 헤더 */}
      <header
        style={{
          background: "rgba(10, 15, 30, 0.9)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border-glass)",
          padding: "0 40px",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: "1400px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: "70px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                background:
                  "linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-purple) 100%)",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
              }}
            >
              🔗
            </div>
            <div>
              <h1
                style={{
                  fontSize: "20px",
                  fontWeight: "800",
                  background:
                    "linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-purple) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  margin: 0,
                }}
              >
                TrustChain
              </h1>
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                블록체인 정품 인증 플랫폼
              </p>
            </div>
          </div>

          <nav style={{ display: "flex", gap: "5px" }}>
            {[
              { id: "shop", label: "🏪 브랜드 샵" },
              { id: "inventory", label: "📦 인벤토리" },
              { id: "marketplace", label: "🔄 중고 마켓" },
              { id: "history", label: "📋 구매 내역" },
              ...(isOwner ? [{ id: "admin", label: "⚙️ 관리자" }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "600",
                  transition: "all 0.2s ease",
                  background:
                    activeTab === tab.id
                      ? "linear-gradient(135deg, rgba(0, 242, 254, 0.2) 0%, rgba(155, 81, 224, 0.2) 100%)"
                      : "transparent",
                  color:
                    activeTab === tab.id
                      ? "var(--accent-cyan)"
                      : "var(--text-secondary)",
                  borderBottom:
                    activeTab === tab.id
                      ? "2px solid var(--accent-cyan)"
                      : "2px solid transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            {account ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  justifyContent: "flex-end",
                }}
              >
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: "700",
                      color: "var(--accent-cyan)",
                    }}
                  >
                    보유 TT {parseFloat(balance).toLocaleString()}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {account.substring(0, 6)}...{account.substring(38)} |{" "}
                    {networkName}
                  </div>
                  {isOwner && (
                    <div
                      style={{
                        fontSize: "10px",
                        color: "var(--accent-purple)",
                        fontWeight: "700",
                      }}
                    >
                      👑 브랜드 관리자
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <button
                    className="btn-secondary"
                    onClick={() => setPaymentModalOpen(true)}
                    disabled={loading || !account}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--accent-cyan)",
                      borderColor: "rgba(0,242,254,0.3)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    TT 충전
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-primary" onClick={connectWallet}>
                🦊 MetaMask 연결
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "40px",
        }}
      >
        {/* ===== 브랜드 샵 탭 ===== */}
        {activeTab === "shop" && (
          <div>
            <div style={{ marginBottom: "40px" }}>
              <h2
                style={{
                  fontSize: "28px",
                  fontWeight: "800",
                  marginBottom: "8px",
                }}
              >
                🏪 브랜드 공식 스토어
              </h2>
              <p style={{ color: "var(--text-secondary)" }}>
                블록체인으로 인증된 정품 명품을 안전하게 구매하세요
              </p>
            </div>

            {/* 상품 목록 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "20px",
              }}
            >
              {products.length === 0 && (
                <div
                  className="glass-panel"
                  style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px" }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏪</div>
                  <p style={{ color: "var(--text-secondary)" }}>
                    등록된 상품이 없습니다
                  </p>
                </div>
              )}
              {products.map((p) => (
                <div
                  key={p.id}
                  className="glass-panel product-card"
                  style={{ padding: "25px" }}
                >
                  <div
                    style={{
                      fontSize: "48px",
                      textAlign: "center",
                      marginBottom: "15px",
                    }}
                  >
                    {mockNftMetadata(p.uri, p.id).imageEmoji}
                  </div>
                  <h3
                    style={{
                      fontSize: "16px",
                      fontWeight: "700",
                      marginBottom: "8px",
                    }}
                  >
                    {p.name}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "15px",
                    }}
                  >
                    <span className="price-tag" style={{ fontSize: "18px" }}>
                      {parseFloat(p.price).toLocaleString()}{" "}
                      <span style={{ fontSize: "12px" }}>TT</span>
                    </span>
                    <span
                      style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                    >
                      재고: {p.stock}개
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      marginBottom: "15px",
                      padding: "8px",
                      background: "rgba(0,242,254,0.05)",
                      borderRadius: "6px",
                      border: "1px solid rgba(0,242,254,0.1)",
                    }}
                  >
                    🔐 PUF 지문: {p.registeredFingerprint.substring(0, 30)}...
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      className="btn-primary"
                      style={{ flex: 1, justifyContent: "center" }}
                      onClick={() => buyProduct(p.id, p.price)}
                      disabled={loading || !account || p.stock === 0}
                    >
                      🛒 에스크로로 안전 구매
                    </button>
                    {isOwner && (
                      <button
                        className="btn-danger"
                        style={{
                          minWidth: "72px",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          fontSize: "13px",
                        }}
                        onClick={() => removeBrandProduct(p.id, p.name)}
                        disabled={loading}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 브랜드 신품 주문 배송 및 수령 대기 내역 */}
            {myBrandOrders.filter((o) => o.status === 0).length > 0 && (
              <div
                className="glass-panel"
                style={{
                  marginTop: "40px",
                  border: "1px solid rgba(0, 242, 254, 0.2)",
                }}
              >
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    marginBottom: "20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  📦 브랜드 샵 주문 배송 및 수령 대기 내역
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "15px",
                  }}
                >
                  {myBrandOrders
                    .filter((o) => o.status === 0)
                    .map((order) => {
                      const isOrderBuyer =
                        account &&
                        order.buyer?.toLowerCase() === account.toLowerCase();
                      return (
                      <div
                        key={order.id}
                        style={{
                          background: "rgba(0,0,0,0.2)",
                          padding: "18px",
                          borderRadius: "12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          border: "1px solid var(--border-glass)",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              gap: "10px",
                              alignItems: "center",
                            }}
                          >
                            <h4 style={{ fontSize: "16px", fontWeight: "700" }}>
                              {order.productName}
                            </h4>
                            <span
                              className="badge badge-escrow"
                              style={{ fontSize: "10px" }}
                            >
                              {order.statusName}
                            </span>
                          </div>
                          <p
                            style={{
                              fontSize: "12px",
                              color: "var(--text-secondary)",
                              marginTop: "6px",
                            }}
                          >
                            주문 ID: <strong>#{order.id}</strong>
                            {isOwner && order.buyer && (
                              <span>
                                {" "}
                                | 구매자:{" "}
                                <strong>
                                  {order.buyer.substring(0, 6)}...
                                  {order.buyer.substring(38)}
                                </strong>
                              </span>
                            )}{" "}
                            | 결제 금액:{" "}
                            <strong style={{ color: "var(--accent-cyan)" }}>
                              {parseFloat(order.price).toLocaleString()} TT
                            </strong>{" "}
                            (에스크로 동결 상태)
                          </p>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                          }}
                        >
                          {isOrderBuyer ? (
                            <button
                              className="btn-primary"
                              style={{
                                background:
                                  "linear-gradient(135deg, #00b0ff 0%, #9b51e0 100%)",
                                color: "white",
                              }}
                              onClick={() => startBrandOrderDeliveryScan(order)}
                              disabled={loading}
                            >
                              🔬 실물 스캔 및 수령 확인
                            </button>
                          ) : (
                            isOwner && (
                              <span
                                className="badge badge-escrow"
                                style={{
                                  fontSize: "10px",
                                  alignSelf: "center",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                구매자 수령 대기
                              </span>
                            )
                          )}
                          {isOwner && (
                            <button
                              className="btn-danger"
                              style={{
                                background: "rgba(255, 23, 68, 0.1)",
                                border: "1px solid var(--danger)",
                                color: "var(--danger)",
                              }}
                              onClick={() => cancelBrandOrder(order.id)}
                              disabled={loading}
                            >
                              🗑️ 주문 취소 (환불)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                    })}
                </div>
              </div>
            )}

            {/* 관리자: 신상품 등록 */}
            {isOwner && (
              <div
                className="glass-panel"
                style={{
                  marginTop: "40px",
                  border: "1px solid rgba(155, 81, 224, 0.3)",
                }}
              >
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    marginBottom: "20px",
                    color: "var(--accent-purple)",
                  }}
                >
                  ⚙️ 새 상품 등록 (관리자 전용)
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "15px",
                    marginBottom: "20px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginBottom: "6px",
                      }}
                    >
                      상품명
                    </label>
                    <input
                      type="text"
                      placeholder="예: 에르메스 버킨백 30"
                      value={newProduct.name}
                      onChange={(e) =>
                        updateNewProductField("name", e.target.value)
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginBottom: "6px",
                      }}
                    >
                      가격 (TT)
                    </label>
                    <input
                      type="number"
                      placeholder="예: 50"
                      value={newProduct.price}
                      onChange={(e) =>
                        updateNewProductField("price", e.target.value)
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginBottom: "6px",
                      }}
                    >
                      재고
                    </label>
                    <input
                      type="number"
                      placeholder="예: 5"
                      value={newProduct.stock}
                      onChange={(e) =>
                        updateNewProductField("stock", e.target.value)
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginBottom: "6px",
                      }}
                    >
                      브랜드 선택
                    </label>
                    <select
                      value={newProduct.uri}
                      onChange={(e) =>
                        updateNewProductField("uri", e.target.value)
                      }
                      className="input-field"
                      style={{ cursor: "pointer" }}
                    >
                      <option value="">-- 브랜드를 선택하세요 --</option>
                      <option value="ipfs://brand/gucci">👜 구찌 (Gucci)</option>
                      <option value="ipfs://brand/hermes">👜 에르메스 (Hermès)</option>
                      <option value="ipfs://brand/rolex">⌚ 롤렉스 (Rolex)</option>
                      <option value="ipfs://brand/chanel">💎 샤넬 (Chanel)</option>
                      <option value="ipfs://brand/other">📦 기타 (Other)</option>
                    </select>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "15px",
                    alignItems: "center",
                  }}
                >
                  <button
                    className="btn-primary"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--accent-purple) 0%, #5c2d91 100%)",
                    }}
                    onClick={startBrandProductScan}
                    disabled={!newProduct.name}
                  >
                    🔬 AI 카메라 스캔 (PUF 지문 등록)
                  </button>
                  {newProduct.fingerprint && (
                    <>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--success)",
                          fontWeight: "600",
                        }}
                      >
                        ✅ 스캔 완료!
                      </div>
                      <button
                        className="btn-primary"
                        onClick={addBrandProduct}
                        disabled={loading}
                      >
                        ✅ 상품 블록체인 등록
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== 인벤토리 탭 ===== */}
        {activeTab === "inventory" && (
          <div>
            <div style={{ marginBottom: "40px" }}>
              <h2
                style={{
                  fontSize: "28px",
                  fontWeight: "800",
                  marginBottom: "8px",
                }}
              >
                📦 내 NFT 인벤토리
              </h2>
              <p style={{ color: "var(--text-secondary)" }}>
                보유 중인 디지털 정품 보증서(NFT)를 관리하세요
              </p>
            </div>

            {myNfts.length === 0 ? (
              <div
                className="glass-panel"
                style={{ textAlign: "center", padding: "80px" }}
              >
                <div style={{ fontSize: "64px", marginBottom: "20px" }}>📦</div>
                <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "10px" }}>
                  보유 중인 NFT가 없습니다
                </h3>
                <p style={{ color: "var(--text-secondary)" }}>
                  브랜드 샵에서 정품을 구매하거나, 일상재를 등록하세요.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: "20px",
                  marginBottom: "40px",
                }}
              >
                {myNfts.map((nft) => (
                  <div
                    key={nft.tokenId}
                    className="glass-panel"
                    style={{ padding: "25px" }}
                  >
                    <div
                      style={{
                        fontSize: "48px",
                        textAlign: "center",
                        marginBottom: "15px",
                      }}
                    >
                      {nft.imageEmoji}
                    </div>
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        marginBottom: "8px",
                      }}
                    >
                      {nft.name}
                    </h3>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginBottom: "10px",
                      }}
                    >
                      Token ID: <strong style={{ color: "white" }}>#{nft.tokenId}</strong>
                    </p>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        marginBottom: "15px",
                        padding: "8px",
                        background: "rgba(0,242,254,0.05)",
                        borderRadius: "6px",
                        border: "1px solid rgba(0,242,254,0.1)",
                        wordBreak: "break-all",
                      }}
                    >
                      🔐 PUF: {nft.fingerprint.substring(0, 40)}...
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <input
                        type="number"
                        placeholder="판매 가격 (TT)"
                        className="input-field"
                        style={{ flex: 1 }}
                        id={`sell-price-${nft.tokenId}`}
                      />
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          const priceInput = document.getElementById(
                            `sell-price-${nft.tokenId}`
                          );
                          if (priceInput && priceInput.value) {
                            listNftForSale(nft.tokenId, priceInput.value);
                          } else {
                            addAlert("판매 가격을 입력해주세요.", "warning");
                          }
                        }}
                        disabled={loading}
                        style={{
                          color: "var(--accent-cyan)",
                          borderColor: "rgba(0,242,254,0.3)",
                        }}
                      >
                        🔄 중고 판매
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 일상재 NFT 등록 섹션 */}
            <div
              className="glass-panel"
              style={{ border: "1px solid rgba(0, 242, 254, 0.2)" }}
            >
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "700",
                  marginBottom: "8px",
                }}
              >
                🌿 일상재 NFT 직접 등록
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginBottom: "20px",
                }}
              >
                브랜드 상점 외 개인이 소유한 일상재(자전거, 가전 등)에 PUF 지문을
                부여하고 NFT로 등록하세요
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "15px",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginBottom: "6px",
                    }}
                  >
                    상품명
                  </label>
                  <input
                    type="text"
                    placeholder="예: 자이언트 TCR 자전거"
                    value={everydayItem.name}
                    onChange={(e) =>
                      setEverydayItem((p) => ({ ...p, name: e.target.value }))
                    }
                    className="input-field"
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginBottom: "6px",
                    }}
                  >
                    희망 판매가 (TT)
                  </label>
                  <input
                    type="number"
                    placeholder="예: 20"
                    value={everydayItem.price}
                    onChange={(e) =>
                      setEverydayItem((p) => ({ ...p, price: e.target.value }))
                    }
                    className="input-field"
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginBottom: "6px",
                    }}
                  >
                    카테고리
                  </label>
                  <input
                    type="text"
                    value="기타"
                    readOnly
                    disabled
                    className="input-field"
                    style={{ cursor: "default", opacity: 0.85 }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                <button
                  className="btn-primary"
                  onClick={startEverydayItemScan}
                  disabled={!everydayItem.name}
                >
                  🔬 AI 카메라 스캔 (PUF 지문 등록)
                </button>
                {everydayItem.fingerprint && (
                  <>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--success)",
                        fontWeight: "600",
                      }}
                    >
                      ✅ 스캔 완료!
                    </div>
                    <button
                      className="btn-primary"
                      style={{
                        background:
                          "linear-gradient(135deg, #00b0ff 0%, #9b51e0 100%)",
                      }}
                      onClick={mintAndListEverydayItem}
                      disabled={loading}
                    >
                      ✅ NFT 민팅 및 마켓 등록
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== 중고 마켓 탭 ===== */}
        {activeTab === "marketplace" && (
          <div>
            <div style={{ marginBottom: "40px" }}>
              <h2
                style={{
                  fontSize: "28px",
                  fontWeight: "800",
                  marginBottom: "8px",
                }}
              >
                🔄 중고 에스크로 마켓플레이스
              </h2>
              <p style={{ color: "var(--text-secondary)" }}>
                블록체인 에스크로로 안전하게 중고 거래하세요. AI 카메라가 실물을
                검증합니다.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {listings.length === 0 && (
                <div
                  className="glass-panel"
                  style={{ textAlign: "center", padding: "60px" }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔄</div>
                  <p style={{ color: "var(--text-secondary)" }}>
                    등록된 중고 상품이 없습니다
                  </p>
                </div>
              )}
              {listings.map((l) => {
                const nftSpec = {
                  name: l.name || getNftDisplayMeta(l.tokenId, l.tokenUri || "").name,
                  imageEmoji:
                    l.imageEmoji ||
                    getNftDisplayMeta(l.tokenId, l.tokenUri || "").imageEmoji,
                };

                // 분쟁 중이고, 내가 판매자나 구매자나 중재자가 아니라면 피드에서 숨김
                const isParticipant =
                  account &&
                  (account.toLowerCase() === l.buyer.toLowerCase() ||
                    account.toLowerCase() === l.seller.toLowerCase() ||
                    isOwner);
                const isListingSeller =
                  account && account.toLowerCase() === l.seller.toLowerCase();
                const isListingBuyer =
                  account &&
                  l.buyer !== zeroAddress &&
                  account.toLowerCase() === l.buyer.toLowerCase();
                const buyerRefundApproved = Boolean(l.buyerRefundApproved);
                const sellerRefundApproved = Boolean(l.sellerRefundApproved);
                if (l.status === 3 && !isParticipant) return null;

                return (
                  <div
                    className="glass-panel"
                    key={l.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderLeft:
                        l.status === 3
                          ? "4px solid var(--danger)"
                          : "none",
                    }}
                  >
                    <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                      <div
                        style={{
                          fontSize: "40px",
                          background: "rgba(255,255,255,0.03)",
                          width: "70px",
                          height: "70px",
                          borderRadius: "12px",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          border: "1px solid var(--border-glass)",
                        }}
                      >
                        {nftSpec.imageEmoji}
                      </div>
                      <div>
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                          }}
                        >
                          <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                            {nftSpec.name}
                          </h3>
                          <span
                            className={`badge ${
                              l.status === 0
                                ? "badge-active"
                                : l.status === 1
                                ? "badge-escrow"
                                : l.status === 3
                                ? "badge-disputed"
                                : "badge-completed"
                            }`}
                            style={{
                              background:
                                l.status === 3
                                  ? "rgba(255, 23, 68, 0.15)"
                                  : "",
                              border:
                                l.status === 3
                                  ? "1px solid var(--danger)"
                                  : "",
                              color:
                                l.status === 3 ? "var(--danger)" : "",
                            }}
                          >
                            {l.statusName}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            marginTop: "4px",
                          }}
                        >
                          토큰 ID:{" "}
                          <strong style={{ color: "white" }}>#{l.tokenId}</strong>{" "}
                          | 판매자:{" "}
                          <strong style={{ color: "white" }}>
                            {l.seller.substring(0, 6)}...{l.seller.substring(38)}
                          </strong>
                          {l.buyer !==
                            "0x0000000000000000000000000000000000000000" && (
                            <>
                              {" "}
                              | 구매자:{" "}
                              <strong style={{ color: "white" }}>
                                {l.buyer.substring(0, 6)}...{l.buyer.substring(38)}
                              </strong>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                        gap: "30px",
                      }}
                    >
                      <div className="price-tag" style={{ fontSize: "24px" }}>
                        {parseFloat(l.price).toLocaleString()}{" "}
                        <span>TT</span>
                      </div>

                      {l.status === 0 &&
                        (isListingSeller ? (
                          <button
                            className="btn-danger"
                            style={{ minWidth: "140px" }}
                            onClick={() => cancelUsedListing(l.id, nftSpec.name)}
                            disabled={loading}
                          >
                            판매 등록 취소
                          </button>
                        ) : (
                          <button
                            className="btn-primary"
                            onClick={() => buyUsedItem(l.id, l.price)}
                            disabled={loading || !account}
                          >
                            🔒 에스크로로 안전하게 구매
                          </button>
                        ))}

                      {l.status === 1 && isListingBuyer && (
                          <div
                            style={{
                              display: "flex",
                              gap: "10px",
                              flexWrap: "wrap",
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              className="btn-primary"
                              style={{
                                background:
                                  "linear-gradient(135deg, #00b0ff 0%, #9b51e0 100%)",
                                color: "white",
                              }}
                              onClick={() => startDeliveryScan(l)}
                              disabled={loading}
                            >
                              🔬 실물 스캔 및 배송 수령 확인
                            </button>
                            <button
                              className="btn-secondary"
                              style={{
                                color: "var(--accent-cyan)",
                                borderColor: "rgba(0, 242, 254, 0.3)",
                              }}
                              onClick={() =>
                                openChatChannel(
                                  l.id,
                                  "trade",
                                  `🤝 거래 대화 #${l.id} (${nftSpec.name})`,
                                  l.seller,
                                  l.buyer
                                )
                              }
                            >
                              💬 판매자와 채팅
                            </button>
                            <button
                              className="btn-secondary"
                              style={{
                                color: buyerRefundApproved
                                  ? "var(--success)"
                                  : "var(--danger)",
                                borderColor: buyerRefundApproved
                                  ? "rgba(0, 255, 136, 0.35)"
                                  : "rgba(255, 23, 68, 0.35)",
                              }}
                              onClick={() => approveUsedRefund(l.id, nftSpec.name)}
                              disabled={loading || buyerRefundApproved}
                            >
                              {buyerRefundApproved
                                ? "취소 동의 완료"
                                : sellerRefundApproved
                                ? "취소 확정"
                                : "거래 취소 동의"}
                            </button>
                          </div>
                        )}

                      {l.status === 1 && isListingSeller && (
                          <div
                            style={{
                              display: "flex",
                              gap: "10px",
                              alignItems: "center",
                              flexWrap: "wrap",
                              justifyContent: "flex-end",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "13px",
                                color: "var(--warning)",
                                fontStyle: "italic",
                              }}
                            >
                              구매자의 배송 수령 확인 대기 중...
                            </span>
                            <button
                              className="btn-secondary"
                              style={{
                                color: "var(--accent-cyan)",
                                borderColor: "rgba(0, 242, 254, 0.3)",
                              }}
                              onClick={() =>
                                openChatChannel(
                                  l.id,
                                  "trade",
                                  `🤝 거래 대화 #${l.id} (${nftSpec.name})`,
                                  l.seller,
                                  l.buyer
                                )
                              }
                            >
                              💬 구매자와 채팅
                            </button>
                            <button
                              className="btn-secondary"
                              style={{
                                color: sellerRefundApproved
                                  ? "var(--success)"
                                  : "var(--danger)",
                                borderColor: sellerRefundApproved
                                  ? "rgba(0, 255, 136, 0.35)"
                                  : "rgba(255, 23, 68, 0.35)",
                              }}
                              onClick={() => approveUsedRefund(l.id, nftSpec.name)}
                              disabled={loading || sellerRefundApproved}
                            >
                              {sellerRefundApproved
                                ? "취소 동의 완료"
                                : buyerRefundApproved
                                ? "취소 확정"
                                : "거래 취소 동의"}
                            </button>
                          </div>
                        )}

                      {l.status === 3 && (
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "13px",
                              color: "var(--danger)",
                              fontWeight: "600",
                            }}
                          >
                            🚨 가품 의심 분쟁 발생 (중재 대기)
                          </span>
                          <button
                            className="btn-secondary"
                            style={{
                              color: "var(--danger)",
                              borderColor: "rgba(255, 23, 68, 0.3)",
                            }}
                            onClick={() => {
                              const isSeller =
                                account &&
                                account.toLowerCase() ===
                                  l.seller.toLowerCase();
                              const chatType = isSeller
                                ? "brand_seller"
                                : "brand_buyer";
                              const chatTitle = isSeller
                                ? `⚖️ 브랜드-판매자 분쟁 대화 #${l.id}`
                                : `⚖️ 브랜드-구매자 분쟁 대화 #${l.id}`;
                              openChatChannel(
                                l.id,
                                chatType,
                                chatTitle,
                                l.seller,
                                l.buyer
                              );
                            }}
                          >
                            💬 중재 브랜드와 채팅
                          </button>
                        </div>
                      )}

                      {l.status === 2 && (
                        <span
                          style={{
                            fontSize: "13px",
                            color: "var(--success)",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          🎉 거래 완료 및 브랜드 로열티 정산됨
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== 구매 내역 탭 ===== */}
        {activeTab === "history" && (
          <div>
            <div style={{ marginBottom: "40px" }}>
              <h2
                style={{
                  fontSize: "28px",
                  fontWeight: "800",
                  marginBottom: "8px",
                }}
              >
                📋 나의 보증서 구매 내역
              </h2>
              <p style={{ color: "var(--text-secondary)" }}>
                브랜드 신품 구매 및 중고 에스크로 거래 내역을 확인하세요
              </p>
            </div>

            {purchaseHistory.length === 0 ? (
              <div
                className="glass-panel"
                style={{ textAlign: "center", padding: "80px" }}
              >
                <div style={{ fontSize: "64px", marginBottom: "20px" }}>📋</div>
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    marginBottom: "10px",
                  }}
                >
                  구매 내역이 없습니다
                </h3>
                <p style={{ color: "var(--text-secondary)" }}>
                  브랜드 샵에서 정품을 구매하거나 중고 마켓에서 거래해보세요.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                {purchaseHistory.map((item) => (
                  <div
                    className="glass-panel"
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderLeft:
                        item.rawStatus === 3
                          ? "4px solid var(--danger)"
                          : item.type === "brand"
                          ? "4px solid var(--accent-cyan)"
                          : "4px solid var(--accent-purple)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          alignItems: "center",
                        }}
                      >
                        <span
                          className="badge badge-active"
                          style={{
                            fontSize: "10px",
                            background:
                              item.rawStatus === 3
                                ? "rgba(255, 23, 68, 0.15)"
                                : item.type === "brand"
                                ? "rgba(0, 242, 254, 0.15)"
                                : "rgba(155, 81, 224, 0.15)",
                            color:
                              item.rawStatus === 3
                                ? "var(--danger)"
                                : item.type === "brand"
                                ? "var(--accent-cyan)"
                                : "var(--accent-purple)",
                          }}
                        >
                          {item.typeName}
                        </span>
                        <h4 style={{ fontSize: "16px", fontWeight: "700" }}>
                          {item.productName}
                        </h4>
                        {item.rawStatus === 3 && (
                          <span
                            className="badge badge-disputed"
                            style={{
                              fontSize: "10px",
                              background: "rgba(255, 23, 68, 0.15)",
                              border: "1px solid var(--danger)",
                              color: "var(--danger)",
                            }}
                          >
                            ⚠️ 분쟁 발생
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          marginTop: "6px",
                        }}
                      >
                        거래 ID: <strong>{item.id}</strong> | 판매처/판매자:{" "}
                        <strong>{item.sellerName}</strong>
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "20px",
                      }}
                    >
                      <div
                        className="price-tag"
                        style={{ fontSize: "20px" }}
                      >
                        {parseFloat(item.price).toLocaleString()}{" "}
                        <span>TT</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          alignItems: "flex-end",
                        }}
                      >
                        <span
                          className={`badge ${item.badgeClass}`}
                          style={{
                            fontSize: "12px",
                            background:
                              item.rawStatus === 3
                                ? "rgba(255, 23, 68, 0.1)"
                                : "",
                            border:
                              item.rawStatus === 3
                                ? "1px solid var(--danger)"
                                : "",
                            color:
                              item.rawStatus === 3 ? "var(--danger)" : "",
                          }}
                        >
                          {item.status}
                        </span>
                        {item.rawStatus === 3 && (
                          <button
                            className="btn-secondary"
                            style={{
                              fontSize: "11px",
                              padding: "4px 8px",
                              color: "var(--danger)",
                              borderColor: "rgba(255, 23, 68, 0.3)",
                            }}
                            onClick={() =>
                              openChatChannel(
                                item.listingId,
                                "brand_buyer",
                                `⚖️ 브랜드-구매자 분쟁 대화 #${item.listingId}`,
                                item.seller,
                                item.buyer
                              )
                            }
                          >
                            💬 중재 브랜드와 채팅
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 관리자 탭 ===== */}
        {activeTab === "admin" && isOwner && (
          <div>
            <div style={{ marginBottom: "40px" }}>
              <h2
                style={{
                  fontSize: "28px",
                  fontWeight: "800",
                  marginBottom: "8px",
                }}
              >
                ⚖️ 분쟁 조정 관리자 패널
              </h2>
              <p style={{ color: "var(--text-secondary)" }}>
                분쟁 발생 시 에스크로 자금 처리와 판매자/구매자와의 중재 채팅을
                진행하세요
              </p>
            </div>

            {disputedListings.length === 0 ? (
              <div
                className="glass-panel"
                style={{ textAlign: "center", padding: "80px" }}
              >
                <div style={{ fontSize: "64px", marginBottom: "20px" }}>✅</div>
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    marginBottom: "10px",
                  }}
                >
                  현재 진행 중인 분쟁이 없습니다
                </h3>
                <p style={{ color: "var(--text-secondary)" }}>
                  모든 거래가 정상적으로 진행 중입니다.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {disputedListings.map((l) => {
                  const nftSpec = {
                    name: l.name || getNftDisplayMeta(l.tokenId, l.tokenUri || "").name,
                    imageEmoji:
                      l.imageEmoji ||
                      getNftDisplayMeta(l.tokenId, l.tokenUri || "").imageEmoji,
                  };
                  return (
                    <div
                      className="glass-panel"
                      key={l.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "20px",
                        borderLeft: "4px solid var(--danger)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              gap: "10px",
                              alignItems: "center",
                            }}
                          >
                            <h3
                              style={{ fontSize: "18px", fontWeight: "700" }}
                            >
                              분쟁조정 #{l.id} - {nftSpec.name}
                            </h3>
                            <span className="badge badge-disputed">
                              동결된 에스크로
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              marginTop: "10px",
                              color: "var(--text-secondary)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                            }}
                          >
                            <div>
                              판매자 주소:{" "}
                              <strong style={{ color: "white" }}>{l.seller}</strong>
                            </div>
                            <div>
                              구매자 주소:{" "}
                              <strong style={{ color: "white" }}>{l.buyer}</strong>
                            </div>
                            <div>
                              에스크로 금액:{" "}
                              <strong style={{ color: "var(--accent-cyan)" }}>
                                {parseFloat(l.price).toLocaleString()} TT
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            alignItems: "flex-end",
                          }}
                        >
                          <div style={{ display: "flex", gap: "12px" }}>
                            <button
                              className="btn-secondary"
                              style={{
                                color: "var(--success)",
                                borderColor: "rgba(0, 230, 118, 0.3)",
                              }}
                              onClick={() => resolveDispute(l.id, false)}
                              disabled={loading}
                            >
                              💸 판매자에게 대금 지급
                            </button>
                            <button
                              className="btn-danger"
                              onClick={() => resolveDispute(l.id, true)}
                              disabled={loading}
                            >
                              ↩️ 구매자에게 전액 환불
                            </button>
                          </div>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <button
                              className="btn-secondary"
                              style={{
                                fontSize: "12px",
                                padding: "6px 12px",
                                color: "var(--accent-cyan)",
                                borderColor: "rgba(0, 242, 254, 0.3)",
                              }}
                              onClick={() =>
                                openChatChannel(
                                  l.id,
                                  "brand_seller",
                                  `⚖️ 판매자 대화 #${l.id}`,
                                  l.seller,
                                  l.buyer
                                )
                              }
                            >
                              💬 판매자와 채팅
                            </button>
                            <button
                              className="btn-secondary"
                              style={{
                                fontSize: "12px",
                                padding: "6px 12px",
                                color: "var(--accent-cyan)",
                                borderColor: "rgba(0, 242, 254, 0.3)",
                              }}
                              onClick={() =>
                                openChatChannel(
                                  l.id,
                                  "brand_buyer",
                                  `⚖️ 구매자 대화 #${l.id}`,
                                  l.seller,
                                  l.buyer
                                )
                              }
                            >
                              💬 구매자와 채팅
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 등록된 지문 vs 제출된 지문 비교 */}
                      <div
                        style={{
                          background: "rgba(255,23,68,0.05)",
                          border: "1px solid rgba(255,23,68,0.2)",
                          borderRadius: "10px",
                          padding: "15px",
                          fontSize: "12px",
                        }}
                      >
                        <div style={{ fontWeight: "700", marginBottom: "8px", color: "var(--danger)" }}>
                          🔍 PUF 지문 불일치 증거
                        </div>
                        <div style={{ color: "var(--text-secondary)" }}>
                          등록 지문: <code style={{ color: "var(--accent-cyan)" }}>{l.registeredFingerprint}</code>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 트랜잭션 로그 */}
        {logs.length > 0 && (
          <div
            className="glass-panel"
            style={{
              marginTop: "40px",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            <h4
              style={{
                fontSize: "14px",
                fontWeight: "700",
                marginBottom: "10px",
                color: "var(--text-secondary)",
              }}
            >
              📜 트랜잭션 로그
            </h4>
            {logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: "12px",
                  padding: "4px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  color:
                    log.type === "success"
                      ? "var(--success)"
                      : log.type === "danger"
                      ? "var(--danger)"
                      : log.type === "warning"
                      ? "var(--warning)"
                      : "var(--text-secondary)",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.3)", marginRight: "8px" }}>
                  {log.timestamp}
                </span>
                {log.message}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ===== 카메라 스캔 모달 ===== */}
      {scanModal.open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(10px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: "500px",
              maxHeight: "85vh",
              overflowY: "auto",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h3 style={{ fontSize: "18px", fontWeight: "800" }}>
                🔬 AI 정품 지문 스캐너
              </h3>
              <button
                onClick={closeScanModal}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: "24px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                marginBottom: "15px",
              }}
            >
              상품: <strong style={{ color: "white" }}>{scanModal.productName}</strong>
            </p>

            {/* 단계 1: 카메라 피드 */}
            {scanModal.stage === "camera_feed" && (
              <div>
                {/* 촬영 단계 표시 (전체 vs 초근접) */}
                <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
                  <div
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "10px",
                      fontSize: "12px",
                      fontWeight: "800",
                      textAlign: "center",
                      transition: "all 0.3s ease",
                      background:
                        scanModal.photoStep === "macro"
                          ? "rgba(0, 242, 254, 0.15)"
                          : "rgba(255, 255, 255, 0.02)",
                      color:
                        scanModal.photoStep === "macro"
                          ? "var(--accent-cyan)"
                          : "var(--text-secondary)",
                      border:
                        scanModal.photoStep === "macro"
                          ? "1px solid var(--accent-cyan)"
                          : "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    📸 1단계: 전체 사진 (Macro)
                  </div>
                  <div
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "10px",
                      fontSize: "12px",
                      fontWeight: "800",
                      textAlign: "center",
                      transition: "all 0.3s ease",
                      background:
                        scanModal.photoStep === "micro"
                          ? "rgba(0, 242, 254, 0.15)"
                          : "rgba(255, 255, 255, 0.02)",
                      color:
                        scanModal.photoStep === "micro"
                          ? "var(--accent-cyan)"
                          : "var(--text-secondary)",
                      border:
                        scanModal.photoStep === "micro"
                          ? "1px solid var(--accent-cyan)"
                          : "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    🔍 2단계: 초근접 질감 (Micro)
                  </div>
                </div>

                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "13px",
                    marginBottom: "15px",
                    lineHeight: "1.5",
                  }}
                >
                  {scanModal.photoStep === "macro" ? (
                    <span>
                      📌 <strong>[전체 형태 촬영]</strong> 상품의 전체적인 모양 및 외관 구도를 분석합니다. 제품 전체가 카메라 렌즈 화면 안에 가득 차고 잘 보이도록 알맞은 거리를 두고 촬영해 주세요.
                    </span>
                  ) : (
                    <span>
                      📌 <strong>[초근접 질감 촬영]</strong> 상품 고유의 미세 지문(원단 직조 패턴, 가죽 모공 질감 등)을 정밀 대조합니다. 카메라 렌즈를 제품 표면에 아주 가까이 밀착시켜 촬영해 주세요.
                    </span>
                  )}
                </p>

                {/* 카메라/업로드 영역 */}
                {!capturedImage ? (
                  <div>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "240px",
                        background: "rgba(0,0,0,0.4)",
                        borderRadius: "12px",
                        overflow: "hidden",
                        marginBottom: "15px",
                        border: "1px solid var(--border-glass)",
                      }}
                    >
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: cameraPermission ? "block" : "none",
                        }}
                      />
                      {!cameraPermission && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <div style={{ fontSize: "48px", marginBottom: "10px" }}>
                            📷
                          </div>
                          <div>카메라를 시작하거나 파일을 업로드하세요</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
                      <button
                        className="btn-primary"
                        style={{ flex: 1 }}
                        onClick={startCamera}
                      >
                        📷 카메라 시작
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ flex: 1, color: "var(--accent-cyan)", borderColor: "rgba(0,242,254,0.3)" }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📁 파일 업로드
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handleFileUpload}
                    />
                    {cameraPermission && (
                      <button
                        className="btn-primary"
                        style={{
                          width: "100%",
                          justifyContent: "center",
                          background:
                            "linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-purple) 100%)",
                        }}
                        onClick={() => {
                          captureFrame();
                        }}
                      >
                        📸 촬영
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <img
                      src={capturedImage}
                      alt="Captured"
                      style={{
                        width: "100%",
                        borderRadius: "12px",
                        marginBottom: "15px",
                      }}
                    />
                    {uploadFileName && (
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "10px" }}>
                        파일: {uploadFileName}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        className="btn-secondary"
                        style={{ flex: 1 }}
                        onClick={resetScanCaptureState}
                      >
                        🔄 다시 촬영
                      </button>
                      <button
                        className="btn-primary"
                        style={{ flex: 1 }}
                        onClick={handleScanCapture}
                        disabled={isAnalyzing}
                      >
                        🔬 AI 분석 시작
                      </button>
                    </div>
                  </div>
                )}
                <canvas ref={canvasRef} style={{ display: "none" }} />
              </div>
            )}

            {/* 단계 2: 스캔 중 */}
            {scanModal.stage === "scanning" && (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div
                  style={{
                    fontSize: "48px",
                    marginBottom: "20px",
                    animation: "pulse 1s infinite",
                  }}
                >
                  🔬
                </div>
                <h4 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "15px" }}>
                  AI 정밀 분석 진행 중...
                </h4>
                <div
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "10px",
                    height: "8px",
                    overflow: "hidden",
                    marginBottom: "10px",
                  }}
                >
                  <div
                    style={{
                      width: `${scanModal.progress}%`,
                      height: "100%",
                      background:
                        "linear-gradient(90deg, var(--accent-cyan) 0%, var(--accent-purple) 100%)",
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {scanModal.progress}% 완료
                </p>
              </div>
            )}

            {/* 단계 3: 성공 (등록) */}
            {scanModal.stage === "success" && (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ fontSize: "64px", marginBottom: "20px" }}>✅</div>
                <h4
                  style={{
                    fontSize: "18px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "var(--success)",
                  }}
                >
                  PUF 지문 등록 완료!
                </h4>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    marginBottom: "20px",
                  }}
                >
                  2단계 촬영(전체 + 초근접)이 완료되었습니다. 상품을 블록체인에
                  등록해주세요.
                </p>
                <div
                  style={{
                    background: "rgba(0,242,254,0.05)",
                    border: "1px solid rgba(0,242,254,0.2)",
                    borderRadius: "10px",
                    padding: "15px",
                    marginBottom: "20px",
                    wordBreak: "break-all",
                    fontSize: "12px",
                    color: "var(--accent-cyan)",
                  }}
                >
                  🔐 {scanModal.generatedFingerprint}
                </div>
                <button
                  className="btn-primary"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={closeScanModal}
                >
                  확인 및 등록 진행
                </button>
              </div>
            )}

            {/* 단계 4: 배송 수령 성공 */}
            {scanModal.stage === "delivery_success" && (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ fontSize: "64px", marginBottom: "20px" }}>🎉</div>
                <h4
                  style={{
                    fontSize: "18px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "var(--success)",
                  }}
                >
                  실물 정품 검증 성공!
                </h4>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    marginBottom: "20px",
                  }}
                >
                  2단계 AI 스캔 결과, 실물 상품의 PUF 지문이 블록체인 등록 지문과
                  일치합니다.
                </p>
                <button
                  className="btn-primary"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    marginBottom: "10px",
                    background:
                      "linear-gradient(135deg, var(--success) 0%, #00b0ff 100%)",
                  }}
                  onClick={async () => {
                    closeScanModal();
                    if (scanModal.brandOrder) {
                      await confirmBrandOrderDelivery(scanModal.brandOrder.id);
                    } else if (scanModal.listing) {
                      await confirmDelivery(scanModal.listing.id);
                    }
                  }}
                  disabled={loading}
                >
                  ✅ 수령 확인 및 에스크로 정산
                </button>
              </div>
            )}

            {/* 단계 5: 배송 수령 실패 (가품 의심) */}
            {scanModal.stage === "delivery_fail" && (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ fontSize: "64px", marginBottom: "20px" }}>🚨</div>
                <h4
                  style={{
                    fontSize: "18px",
                    fontWeight: "800",
                    marginBottom: "10px",
                    color: "var(--danger)",
                  }}
                >
                  ⚠️ 지문 불일치 - 가품 의심!
                </h4>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    marginBottom: "20px",
                  }}
                >
                  AI 스캔 결과, 실물 상품의 PUF 지문이 등록 지문과 불일치합니다.
                  분쟁을 제기하시겠습니까?
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className="btn-secondary"
                    style={{ flex: 1 }}
                    onClick={closeScanModal}
                  >
                    취소
                  </button>
                  <button
                    className="btn-danger"
                    style={{ flex: 1 }}
                    onClick={async () => {
                      closeScanModal();
                      if (scanModal.listing) {
                        await raiseDispute(
                          scanModal.listing.id,
                          scanModal.generatedFingerprint
                        );
                      }
                    }}
                    disabled={loading}
                  >
                    🚨 분쟁 제기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 💬 실시간 AI/분쟁 조정 하이브리드 채팅창 */}
      {activeChatChannel && (
        <div
          style={{
            position: "fixed",
            bottom: "30px",
            right: "30px",
            width: "380px",
            height: "480px",
            background: "rgba(10, 15, 30, 0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--accent-cyan)",
            boxShadow: "0 10px 40px rgba(0, 242, 254, 0.2)",
            borderRadius: "16px",
            display: "flex",
            flexDirection: "column",
            zIndex: 1100,
            overflow: "hidden",
            animation: "slideIn 0.3s ease",
          }}
        >
          {/* 헤더 */}
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(0, 242, 254, 0.2) 0%, rgba(155, 81, 224, 0.2) 100%)",
              padding: "15px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: "800",
                  color: "var(--accent-cyan)",
                  margin: 0,
                }}
              >
                💬 {activeChatChannel.title}
              </h4>
              <p
                style={{
                  fontSize: "10px",
                  color: "var(--text-secondary)",
                  margin: "4px 0 0 0",
                }}
              >
                내 지갑: {account.substring(0, 6)}...{account.substring(38)}
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                className="btn-primary"
                onClick={saveChatToBlockchain}
                disabled={isArchivingChat || loading}
                style={{
                  fontSize: "10px",
                  padding: "4px 8px",
                  background: "rgba(0, 242, 254, 0.15)",
                  border: "1px solid var(--accent-cyan)",
                  color: "var(--accent-cyan)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "700",
                }}
              >
                {isArchivingChat ? "저장 중..." : "🔒 온체인 영구 저장"}
              </button>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: "18px",
                  cursor: "pointer",
                }}
                onClick={() => setActiveChatChannel(null)}
              >
                ✕
              </button>
            </div>
          </div>

          {/* 메시지 리스트 */}
          <div
            style={{
              flex: 1,
              padding: "15px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "rgba(0, 0, 0, 0.2)",
            }}
          >
            {chatMessages.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  textAlign: "center",
                  marginTop: "150px",
                }}
              >
                대화의 첫 메시지를 입력해 보세요!
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isMe =
                  msg.sender.toLowerCase() === account.toLowerCase();
                return (
                  <div
                    key={idx}
                    style={{
                      alignSelf: isMe ? "flex-end" : "flex-start",
                      maxWidth: "75%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: isMe ? "flex-end" : "flex-start",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "9px",
                        color: "var(--text-secondary)",
                        marginBottom: "2px",
                      }}
                    >
                      {isMe ? "나" : msg.sender.substring(0, 6) + "..."}
                    </span>
                    <div
                      style={{
                        background: isMe
                          ? "var(--accent-cyan)"
                          : "rgba(255, 255, 255, 0.05)",
                        color: isMe ? "#000" : "#fff",
                        padding: "8px 12px",
                        borderRadius: isMe
                          ? "12px 12px 2px 12px"
                          : "12px 12px 12px 2px",
                        fontSize: "12px",
                        lineHeight: "1.4",
                        fontWeight: isMe ? "700" : "500",
                        wordBreak: "break-all",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 입력창 */}
          <div
            style={{
              padding: "12px",
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
              background: "rgba(0,0,0,0.3)",
              display: "flex",
              gap: "8px",
            }}
          >
            <input
              type="text"
              placeholder="메시지를 입력하세요..."
              value={newChatMessage}
              onChange={(e) => setNewChatMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChatMessage();
              }}
              style={{
                flex: 1,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-glass)",
                borderRadius: "8px",
                color: "#fff",
                padding: "8px 12px",
                fontSize: "12px",
              }}
            />
            <button
              className="btn-primary"
              onClick={sendChatMessage}
              style={{
                padding: "8px 15px",
                fontSize: "12px",
                background:
                  "linear-gradient(135deg, var(--accent-cyan) 0%, #9b51e0 100%)",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontWeight: "700",
              }}
            >
              전송
            </button>
          </div>
        </div>
      )}

      {isPaymentModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 5000,
            background: "rgba(0, 0, 0, 0.72)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={() => {
            if (!loading) setPaymentModalOpen(false);
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: "100%",
              maxWidth: "460px",
              padding: "24px",
              borderRadius: "14px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "16px",
                marginBottom: "22px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "800",
                    marginBottom: "6px",
                  }}
                >
                  TT 충전 결제
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                  충전 금액과 결제 수단을 선택하세요
                </p>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                disabled={loading}
                aria-label="결제창 닫기"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-glass)",
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "var(--text-secondary)",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: "18px",
                }}
              >
                x
              </button>
            </div>

            <div style={{ marginBottom: "22px" }}>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  fontWeight: "700",
                  marginBottom: "10px",
                }}
              >
                충전 금액
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                }}
              >
                {topUpOptions.map((amount) => {
                  const selected = selectedTopUpAmount === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setSelectedTopUpAmount(amount)}
                      style={{
                        padding: "14px 10px",
                        borderRadius: "10px",
                        border: selected
                          ? "1px solid var(--accent-cyan)"
                          : "1px solid var(--border-glass)",
                        background: selected
                          ? "rgba(0, 242, 254, 0.13)"
                          : "rgba(255, 255, 255, 0.04)",
                        color: selected
                          ? "var(--accent-cyan)"
                          : "var(--text-primary)",
                        cursor: "pointer",
                        fontWeight: "800",
                        fontSize: "14px",
                      }}
                    >
                      {amount.toLocaleString()} TT
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: "22px" }}>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  fontWeight: "700",
                  marginBottom: "10px",
                }}
              >
                결제 수단
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {paymentMethods.map((method) => {
                  const selected = selectedPaymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPaymentMethod(method.id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        padding: "13px 14px",
                        borderRadius: "10px",
                        border: selected
                          ? "1px solid var(--accent-cyan)"
                          : "1px solid var(--border-glass)",
                        background: selected
                          ? "rgba(0, 242, 254, 0.1)"
                          : "rgba(255, 255, 255, 0.04)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span>
                        <strong style={{ display: "block", fontSize: "14px" }}>
                          {method.label}
                        </strong>
                        <span
                          style={{
                            display: "block",
                            color: "var(--text-secondary)",
                            fontSize: "12px",
                            marginTop: "3px",
                          }}
                        >
                          {method.detail}
                        </span>
                      </span>
                      <span
                        style={{
                          width: "18px",
                          height: "18px",
                          borderRadius: "50%",
                          border: selected
                            ? "5px solid var(--accent-cyan)"
                            : "2px solid var(--text-muted)",
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "rgba(0, 0, 0, 0.2)",
                border: "1px solid var(--border-glass)",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginBottom: "8px",
                }}
              >
                <span>충전 예정</span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {selectedTopUpAmount.toLocaleString()} TT
                </strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                }}
              >
                <span>결제 수단</span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {paymentMethods.find((m) => m.id === selectedPaymentMethod)
                    ?.label || "미선택"}
                </strong>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={purchaseTrustTokens}
              disabled={loading || !selectedPaymentMethod}
              style={{
                width: "100%",
                justifyContent: "center",
                opacity: loading || !selectedPaymentMethod ? 0.6 : 1,
              }}
            >
              {loading ? "결제 처리 중..." : "데모 결제 완료"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
