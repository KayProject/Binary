// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BinaryFaucet, IERC20} from "../src/BinaryFaucet.sol";

contract MockUSDm is IERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        if (balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract BinaryFaucetTest is Test {
    MockUSDm usdm;
    BinaryFaucet faucet;

    address ops = makeAddr("ops");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant DRIP = 1e18;

    event Claimed(address indexed user, uint256 amount);

    function setUp() public {
        usdm = new MockUSDm();
        vm.prank(ops);
        faucet = new BinaryFaucet(address(usdm), DRIP);
    }

    function fund(uint256 amount) internal {
        usdm.mint(address(faucet), amount);
    }

    function test_claim() public {
        fund(10e18);
        vm.expectEmit(true, false, false, true);
        emit Claimed(alice, DRIP);
        vm.prank(alice);
        faucet.claim();

        assertEq(usdm.balanceOf(alice), DRIP);
        assertEq(faucet.totalClaims(), 1);
        assertTrue(faucet.claimed(alice));
    }

    function test_claim_oncePerWallet() public {
        fund(10e18);
        vm.startPrank(alice);
        faucet.claim();
        vm.expectRevert(BinaryFaucet.AlreadyClaimed.selector);
        faucet.claim();
        vm.stopPrank();
    }

    function test_claim_revertsWhenDry() public {
        // The launch state: stub wired to an unfunded contract.
        vm.prank(alice);
        vm.expectRevert(BinaryFaucet.FaucetDry.selector);
        faucet.claim();
    }

    function test_claim_revertsWhenPaused() public {
        fund(10e18);
        vm.prank(ops);
        faucet.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(BinaryFaucet.Paused.selector);
        faucet.claim();
    }

    function test_claimable() public {
        assertFalse(faucet.claimable(alice)); // dry
        fund(10e18);
        assertTrue(faucet.claimable(alice));
        vm.prank(alice);
        faucet.claim();
        assertFalse(faucet.claimable(alice)); // already claimed
        assertTrue(faucet.claimable(bob));
    }

    function test_setDripAmount() public {
        vm.prank(ops);
        faucet.setDripAmount(2e18);
        assertEq(faucet.dripAmount(), 2e18);

        vm.prank(alice);
        vm.expectRevert(BinaryFaucet.NotOwner.selector);
        faucet.setDripAmount(3e18);
    }

    function test_defund() public {
        fund(10e18);
        vm.prank(ops);
        faucet.defund(ops, 4e18);
        assertEq(usdm.balanceOf(ops), 4e18);

        vm.prank(alice);
        vm.expectRevert(BinaryFaucet.NotOwner.selector);
        faucet.defund(alice, 1e18);
    }

    function test_potOutlastsExactly() public {
        fund(2e18); // exactly two drips
        vm.prank(alice);
        faucet.claim();
        vm.prank(bob);
        faucet.claim();
        vm.prank(makeAddr("carol"));
        vm.expectRevert(BinaryFaucet.FaucetDry.selector);
        faucet.claim();
    }
}
