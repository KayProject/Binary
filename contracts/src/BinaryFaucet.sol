// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title BinaryFaucet
/// @notice The entry promo: new users claim a fixed drip of USDm, once per
///         wallet, funded entirely by the owner topping the contract up.
///         An unfunded faucet is a safe stub — claims revert until USDm
///         arrives, so the frontend can ship wired before any money does.
contract BinaryFaucet {
    IERC20 public immutable usdm;

    address public owner;
    bool public paused;

    /// USDm per claim (18 dec). Owner-tunable so the promo can be repriced
    /// without redeploying.
    uint256 public dripAmount;

    mapping(address => bool) public claimed;
    uint256 public totalClaims;

    event Claimed(address indexed user, uint256 amount);
    event DripAmountSet(uint256 amount);
    event PausedSet(bool paused);
    event Defunded(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error Paused();
    error AlreadyClaimed();
    error FaucetDry();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address usdm_, uint256 dripAmount_) {
        if (usdm_ == address(0)) revert ZeroAddress();
        if (dripAmount_ == 0) revert ZeroAmount();
        usdm = IERC20(usdm_);
        dripAmount = dripAmount_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit DripAmountSet(dripAmount_);
    }

    /// @notice One free drip per wallet, while the pot lasts.
    function claim() external {
        if (paused) revert Paused();
        if (claimed[msg.sender]) revert AlreadyClaimed();
        if (usdm.balanceOf(address(this)) < dripAmount) revert FaucetDry();
        claimed[msg.sender] = true;
        unchecked {
            ++totalClaims;
        }
        if (!usdm.transfer(msg.sender, dripAmount)) revert TransferFailed();
        emit Claimed(msg.sender, dripAmount);
    }

    /// @notice Whether `user` can claim right now (frontend gate).
    function claimable(address user) external view returns (bool) {
        return !paused && !claimed[user] && usdm.balanceOf(address(this)) >= dripAmount;
    }

    function setDripAmount(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        dripAmount = amount;
        emit DripAmountSet(amount);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Pull remaining promo budget back out.
    function defund(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (!usdm.transfer(to, amount)) revert TransferFailed();
        emit Defunded(to, amount);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, to);
        owner = to;
    }
}
