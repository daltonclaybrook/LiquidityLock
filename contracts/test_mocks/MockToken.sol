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

    /// @dev enables this contract to receive ETH for testing purposes
    receive () external payable {}

    function convertTokensAndSendETH(address recipient, uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "Not enough tokens to convert to ETH");
        _burn(msg.sender, amount);
        safeTransferETH(recipient, amount);
    }

    function safeTransferETH(address to, uint256 value) private {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, 'STE');
    }
}
