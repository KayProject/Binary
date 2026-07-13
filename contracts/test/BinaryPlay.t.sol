// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BinaryPlay} from "../src/BinaryPlay.sol";

contract BinaryPlayTest is Test {
    BinaryPlay play;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant DAY = 1 days;

    function setUp() public {
        play = new BinaryPlay();
        vm.warp(1_000 * DAY); // deterministic "today"
    }

    function _player(address who)
        internal
        view
        returns (uint32 lastDay, uint32 streak, uint32 longest, uint64 checkIns, uint64 picks)
    {
        return play.players(who);
    }

    function test_firstCheckIn_startsStreak() public {
        vm.prank(alice);
        play.checkIn();
        (, uint32 streak, uint32 longest, uint64 count,) = _player(alice);
        assertEq(streak, 1);
        assertEq(longest, 1);
        assertEq(count, 1);
        assertEq(play.currentStreak(alice), 1);
    }

    function test_sameDayRepeat_succeedsWithoutStreakGrowth() public {
        vm.startPrank(alice);
        play.checkIn();
        play.checkIn();
        play.checkIn();
        vm.stopPrank();
        (, uint32 streak,, uint64 count,) = _player(alice);
        assertEq(streak, 1); // no double-increment
        assertEq(count, 3); // but every call counted as activity
    }

    function test_consecutiveDays_growStreak() public {
        vm.startPrank(alice);
        play.checkIn();
        vm.warp(block.timestamp + DAY);
        play.checkIn();
        vm.warp(block.timestamp + DAY);
        play.checkIn();
        vm.stopPrank();
        (, uint32 streak, uint32 longest,,) = _player(alice);
        assertEq(streak, 3);
        assertEq(longest, 3);
    }

    function test_missedDay_resetsStreak_keepsLongest() public {
        vm.startPrank(alice);
        play.checkIn();
        vm.warp(block.timestamp + DAY);
        play.checkIn(); // streak 2
        vm.warp(block.timestamp + 3 * DAY); // gap
        play.checkIn(); // reset to 1
        vm.stopPrank();
        (, uint32 streak, uint32 longest,,) = _player(alice);
        assertEq(streak, 1);
        assertEq(longest, 2);
    }

    function test_currentStreak_zeroWhenBroken() public {
        vm.prank(alice);
        play.checkIn();
        vm.warp(block.timestamp + 2 * DAY); // didn't check in yesterday or today
        assertEq(play.currentStreak(alice), 0);
    }

    function test_currentStreak_survivesYesterdayGrace() public {
        vm.prank(alice);
        play.checkIn();
        vm.warp(block.timestamp + DAY); // yesterday's check-in, today still pending
        assertEq(play.currentStreak(alice), 1);
    }

    function test_pick_storesOutcomePlusOne() public {
        bytes32 market = keccak256("condition-1");
        vm.prank(alice);
        play.pick(market, 0);
        assertEq(play.pickOf(alice, market), 1); // 0 means none, so outcome+1
    }

    function test_repick_overwrites() public {
        bytes32 market = keccak256("condition-1");
        vm.startPrank(alice);
        play.pick(market, 0);
        play.pick(market, 1); // changed their mind
        vm.stopPrank();
        assertEq(play.pickOf(alice, market), 2);
        (,,,, uint64 picks) = _player(alice);
        assertEq(picks, 2); // both calls counted as activity
    }

    function test_playersIsolated() public {
        bytes32 market = keccak256("condition-1");
        vm.prank(alice);
        play.pick(market, 1);
        vm.prank(bob);
        play.checkIn();
        assertEq(play.pickOf(bob, market), 0);
        assertEq(play.currentStreak(alice), 0);
        (, uint32 bobStreak,,,) = _player(bob);
        assertEq(bobStreak, 1);
    }

    function test_events() public {
        bytes32 market = keccak256("condition-1");
        uint32 today = uint32(block.timestamp / DAY);

        vm.expectEmit(true, true, false, true);
        emit BinaryPlay.CheckedIn(alice, today, 1);
        vm.prank(alice);
        play.checkIn();

        vm.expectEmit(true, true, false, true);
        emit BinaryPlay.Picked(alice, market, 1);
        vm.prank(alice);
        play.pick(market, 1);
    }
}
