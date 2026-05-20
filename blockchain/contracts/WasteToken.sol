// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WasteToken — ERC-20 reward token for the WasteWise platform
/// @notice "WWT" tokens are minted by a designated minter (RewardDistributor)
///         and awarded to users who recycle waste.
contract WasteToken is ERC20, Ownable {
    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The address authorised to mint new tokens.
    ///         Typically the RewardDistributor contract.
    address public minter;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when the owner updates the minter address.
    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotMinter(address caller);
    error ZeroAddress();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param initialOwner The address that will own this contract.
    constructor(address initialOwner)
        ERC20("WasteWise Token", "WWT")
        Ownable(initialOwner)
    {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Set the minter address. Only callable by the contract owner.
    /// @param newMinter The address to grant minting rights to.
    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddress();
        address previous = minter;
        minter = newMinter;
        emit MinterUpdated(previous, newMinter);
    }

    // ─── Minting ──────────────────────────────────────────────────────────────

    /// @notice Mint `amount` WWT tokens to `to`. Only callable by the minter.
    /// @param to     Recipient of the newly minted tokens.
    /// @param amount Number of tokens (in wei units, 18 decimals).
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        _mint(to, amount);
    }
}
