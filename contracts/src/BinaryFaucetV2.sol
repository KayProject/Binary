// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title BinaryFaucetV2
/// @notice Simulation faucet: waitlisted users claim a fixed drip of USDm,
///         capped at `maxClaimsPerDay` times per day per wallet. Funded
///         entirely by the owner topping the contract up.
contract BinaryFaucetV2 {
    IERC20 public immutable usdm;

    address public owner;
    bool public paused;

    /// USDm per claim (18 dec). Owner-tunable.
    uint256 public dripAmount;
    
    /// Maximum number of times a single wallet can claim in one UTC day.
    uint256 public maxClaimsPerDay;

    /// Waitlist gate: only whitelisted wallets can claim.
    mapping(address => bool) public whitelisted;
    
    struct UserClaim {
        uint32 lastClaimDay;
        uint32 claimsToday;
    }
    
    mapping(address => UserClaim) public userClaims;
    uint256 public totalClaims;

    event Claimed(address indexed user, uint256 amount, uint32 claimsToday);
    event Whitelisted(address indexed user, bool allowed);
    event DripAmountSet(uint256 amount);
    event MaxClaimsPerDaySet(uint256 maxClaims);
    event PausedSet(bool paused);
    event Defunded(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error Paused();
    error NotWhitelisted();
    error DailyClaimLimitReached();
    error FaucetDry();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address usdm_, uint256 dripAmount_, uint256 maxClaimsPerDay_) {
        if (usdm_ == address(0)) revert ZeroAddress();
        if (dripAmount_ == 0) revert ZeroAmount();
        usdm = IERC20(usdm_);
        dripAmount = dripAmount_;
        maxClaimsPerDay = maxClaimsPerDay_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit DripAmountSet(dripAmount_);
        emit MaxClaimsPerDaySet(maxClaimsPerDay_);
    }

    /// @notice Drip for a whitelisted wallet, capped per day.
    function claim() external {
        if (paused) revert Paused();
        if (!whitelisted[msg.sender]) revert NotWhitelisted();
        
        uint32 currentDay = uint32(block.timestamp / 1 days);
        UserClaim storage u = userClaims[msg.sender];
        
        if (u.lastClaimDay != currentDay) {
            u.lastClaimDay = currentDay;
            u.claimsToday = 0;
        }
        
        if (u.claimsToday >= maxClaimsPerDay) revert DailyClaimLimitReached();
        if (usdm.balanceOf(address(this)) < dripAmount) revert FaucetDry();
        
        u.claimsToday++;
        
        unchecked {
            ++totalClaims;
        }
        if (!usdm.transfer(msg.sender, dripAmount)) revert TransferFailed();
        emit Claimed(msg.sender, dripAmount, u.claimsToday);
    }

    /// @notice Whether `user` can claim right now (frontend gate).
    function claimable(address user) external view returns (bool) {
        if (paused || !whitelisted[user] || usdm.balanceOf(address(this)) < dripAmount) {
            return false;
        }
        
        uint32 currentDay = uint32(block.timestamp / 1 days);
        UserClaim memory u = userClaims[user];
        
        if (u.lastClaimDay != currentDay) {
            return true; // Reset for the day
        }
        
        return u.claimsToday < maxClaimsPerDay;
    }

    /// @notice Batch-whitelist waitlist wallets (or revoke with allowed=false).
    function setWhitelisted(address[] calldata users, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            whitelisted[users[i]] = allowed;
            emit Whitelisted(users[i], allowed);
        }
    }

    function setDripAmount(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        dripAmount = amount;
        emit DripAmountSet(amount);
    }
    
    function setMaxClaimsPerDay(uint256 maxClaims) external onlyOwner {
        maxClaimsPerDay = maxClaims;
        emit MaxClaimsPerDaySet(maxClaims);
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
