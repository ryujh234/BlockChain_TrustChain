content = open('src/App.jsx', encoding='utf-8').read()
features = {
    '2단계 촬영 (Macro/Micro)': 'photoStep' in content and 'macro' in content and 'micro' in content,
    '전체/초근접 안내 메시지': 'Macro' in content and 'Micro' in content and 'camera_feed' in content,
    'MobileNet AI 분류/비교': 'netModel' in content and 'calculateCosineSimilarity' in content,
    '에스크로 중 P2P 채팅': 'openChatChannel' in content and "'trade'" in content,
    '분쟁시 브랜드-판매자 채팅': "'brand_seller'" in content,
    '분쟁시 브랜드-구매자 채팅': "'brand_buyer'" in content,
    '구매내역 분쟁 배지': 'badge-disputed' in content,
    '구매내역 분쟁 채팅버튼': 'rawStatus === 3' in content,
    'saveChatHistory (블록체인 저장)': 'saveChatHistory' in content,
    '온체인 영구 저장 버튼': 'saveChatToBlockchain' in content,
    'localStorage 채팅 폴링': 'localStorage' in content,
    'ChatSaved 이벤트 복구': 'ChatSaved' in content,
    '분쟁 제기 raiseDispute': 'raiseDispute' in content,
    '분쟁 해결 resolveDispute': 'resolveDispute' in content,
    '관리자 분쟁 패널': 'disputedListings' in content,
    '브랜드 주문 취소/환불': 'cancelBrandOrder' in content,
    '일상재 NFT 등록': 'mintAndListEverydayItem' in content,
    '브랜드 신품 배송 수령 확인': 'confirmBrandOrderDelivery' in content,
    '가품 검출 분쟁 자동 제기': 'delivery_fail' in content,
}
all_ok = True
for name, ok in features.items():
    status = 'OK' if ok else 'MISSING'
    print(f'[{status}] {name}')
    if not ok:
        all_ok = False
print()
print('Total:', 'ALL OK' if all_ok else 'SOME MISSING')
print(f'File size: {len(content):,} bytes, Lines: {content.count(chr(10))+1:,}')
