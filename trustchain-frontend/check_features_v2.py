content = open('src/App.jsx', encoding='utf-8').read()

# The check_features.py was using single-quoted strings but App.jsx uses double quotes
# Let's verify the ACTUAL presence of the trade/brand chat buttons in JSX

checks_v2 = [
    ("P2P trade chat button (buyer side)", '"trade"' in content and 'openChatChannel' in content),
    ("brand_seller dispute chat", '"brand_seller"' in content),
    ("brand_buyer dispute chat", '"brand_buyer"' in content),
    ("escrow status=1 buyer chat button", 'l.status === 1' in content and 'buyer.toLowerCase' in content.lower()),
    ("dispute badge in history", 'badge-disputed' in content),
    ("saveChatHistory call", 'saveChatHistory' in content),
    ("2-step scan (photoStep)", 'photoStep' in content),
    ("Macro label UI", '1\xeb\x8b\xa8\xea\xb3\x84' in content.encode('utf-8', 'replace').decode('utf-8', 'replace')),
    ("macro guidance text", 'Macro' in content),
    ("micro guidance text", 'Micro' in content),
    ("cancelOrder brand function", 'cancelBrandOrder' in content),
    ("mintAndListUsedItem", 'mintAndListUsedItem' in content),
]

all_ok = True
for name, ok in checks_v2:
    status = 'OK' if ok else 'MISSING'
    if not ok:
        all_ok = False
    print(f'[{status}] {name}')

print()
print('ALL OK' if all_ok else 'SOME MISSING')
