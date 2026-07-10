// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title BinaryDeposits
/// @notice Celo-side entry and exit point for Binary. Users deposit USDm here
///         (the only transaction they ever sign); the operator sweeps deposits
///         into the bridging pipeline and pays withdrawals back out.
///
///         Trade-or-return invariant, on-chain half: payouts can only be sent
///         to addresses that have deposited before — the contract cannot pay
///         an address the user never controlled. The Polygon half of the
///         invariant lives in the key-management policy.
contract BinaryDeposits {
    IERC20 public immutable usdm;

    address public owner; // Binary ops
    address public treasury; // bridging wallet deposits are swept into
    bool public paused;

    uint256 public nextDepositId;
    uint256 public nextPayoutId;

    /// Cumulative deposits per user. Nonzero == known payout address.
    mapping(address => uint256) public totalDeposited;
    /// Cumulative payouts per user (audit; may exceed deposits — winnings).
    mapping(address => uint256) public totalPaidOut;

    event Deposited(uint256 indexed id, address indexed user, uint256 amount);
    event PaidOut(uint256 indexed id, address indexed user, uint256 amount);
    event Swept(address indexed to, uint256 amount);
    event TreasuryChanged(address indexed treasury);
    event PausedSet(bool paused);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error Paused();
    error ZeroAmount();
    error ZeroAddress();
    error UnknownUser();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address usdm_, address treasury_) {
        if (usdm_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        usdm = IERC20(usdm_);
        treasury = treasury_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasuryChanged(treasury_);
    }

    /// @notice Deposit USDm to fund your Binary balance. Requires prior approval.
    function deposit(uint256 amount) external {
        if (paused) revert Paused();
        if (amount == 0) revert ZeroAmount();
        totalDeposited[msg.sender] += amount;
        uint256 id = nextDepositId++;
        if (!usdm.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(id, msg.sender, amount);
    }

    /// @notice Pay a withdrawal back to a user. Only ever to an address that
    ///         has deposited before (pinned payout address).
    function payout(address user, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (totalDeposited[user] == 0) revert UnknownUser();
        totalPaidOut[user] += amount;
        uint256 id = nextPayoutId++;
        if (!usdm.transfer(user, amount)) revert TransferFailed();
        emit PaidOut(id, user, amount);
    }

    /// @notice Move deposited funds into the bridging pipeline.
    function sweep(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (!usdm.transfer(treasury, amount)) revert TransferFailed();
        emit Swept(treasury, amount);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
