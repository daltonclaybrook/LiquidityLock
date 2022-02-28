// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol, uint256 mintAmount) ERC20(name, symbol) {
        _mint(msg.sender, mintAmount);
    }

    function mockMint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
