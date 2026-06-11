// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TrustToken is ERC20, Ownable {
    constructor(uint256 initialSupply) ERC20("TrustToken", "TT") {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    // Helper mint function for testing/distribution convenience
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
