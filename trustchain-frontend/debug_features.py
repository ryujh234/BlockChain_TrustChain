content = open('src/App.jsx', encoding='utf-8').read()

# Check exact strings present in the file
check_items = [
    ("openChatChannel function", "const openChatChannel"),
    ("'trade' type in openChatChannel", "type === \"trade\""),
    ("'brand_seller' type", "\"brand_seller\""),
    ("'brand_buyer' type", "\"brand_buyer\""),
    ("trade chat button", "openChatChannel("),
    ("chat button for buyer when escrow locked", "buyer.toLowerCase() === account.toLowerCase()"),
]

for name, needle in check_items:
    found = needle in content
    idx = content.find(needle)
    print(f"[{'OK' if found else 'MISSING'}] {name}: {needle[:40]!r} (at char {idx})")
