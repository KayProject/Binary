// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BinaryPlay
/// @notice Free-play engagement layer for Binary: daily check-ins with streaks
///         and free picks on real Polymarket markets. Costs gas and nothing
///         else — no tokens, no owner, no pause, fully immutable. Grading and
///         XP live off-chain, computed from this contract's events.
contract BinaryPlay {
    struct Player {
        uint32 lastDay; // last UTC day (block.timestamp / 1 days) with a check-in
        uint32 streak; // consecutive-day streak as of lastDay
        uint32 longestStreak;
        uint64 checkInCount; // total successful check-in calls (incl. same-day repeats)
        uint64 pickCount; // total pick calls (incl. re-picks)
    }

    /// Per-player stats. Free to read for any address.
    mapping(address => Player) public players;

    /// Latest pick per player per market: 0 = none, otherwise outcome index + 1.
    /// Re-picking is allowed; last write wins until the market closes.
    mapping(address => mapping(bytes32 => uint8)) public pickOf;

    event CheckedIn(address indexed user, uint32 indexed day, uint32 streak);
    event Picked(address indexed user, bytes32 indexed marketId, uint8 outcome);

    /// @notice Daily check-in. Never reverts on repeats: a same-day call still
    ///         succeeds and emits (real activity), it just can't grow the
    ///         streak twice in one day.
    function checkIn() external {
        Player storage p = players[msg.sender];
        uint32 day = uint32(block.timestamp / 1 days);

        if (day != p.lastDay || p.checkInCount == 0) {
            p.streak = (p.checkInCount != 0 && day == p.lastDay + 1) ? p.streak + 1 : 1;
            if (p.streak > p.longestStreak) p.longestStreak = p.streak;
            p.lastDay = day;
        }
        p.checkInCount += 1;
        emit CheckedIn(msg.sender, day, p.streak);
    }

    /// @notice Record a free pick on a market. `marketId` is the keccak256 of
    ///         the Polymarket condition ID; `outcome` is the outcome index.
    ///         Calling again overwrites — changing your mind is allowed.
    function pick(bytes32 marketId, uint8 outcome) external {
        pickOf[msg.sender][marketId] = outcome + 1;
        players[msg.sender].pickCount += 1;
        emit Picked(msg.sender, marketId, outcome);
    }

    /// @notice Current live streak for a user: their stored streak if they
    ///         checked in today or yesterday, else 0 (broken).
    function currentStreak(address user) external view returns (uint32) {
        Player storage p = players[user];
        if (p.checkInCount == 0) return 0;
        uint32 day = uint32(block.timestamp / 1 days);
        if (day > p.lastDay + 1) return 0;
        return p.streak;
    }
}
