// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BinaryDeposits, IERC20} from "../src/BinaryDeposits.sol";

contract MockUSDm is IERC20 {
    string public constant name = "Mento Dollar";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        if (balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] < amount || balanceOf[from] < amount) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract BinaryDepositsTest is Test {
    MockUSDm usdm;
    BinaryDeposits vault;

    address ops = makeAddr("ops");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address mallory = makeAddr("mallory");

    event Deposited(uint256 indexed id, address indexed user, uint256 amount);
    event PaidOut(uint256 indexed id, address indexed user, uint256 amount);

    function setUp() public {
        usdm = new MockUSDm();
        vm.prank(ops);
        vault = new BinaryDeposits(address(usdm), treasury);
        usdm.mint(alice, 1_000e18);
        vm.prank(alice);
        usdm.approve(address(vault), type(uint256).max);
    }

    function test_deposit() public {
        vm.expectEmit(true, true, false, true);
        emit Deposited(0, alice, 20e18);
        vm.prank(alice);
        vault.deposit(20e18);

        assertEq(usdm.balanceOf(address(vault)), 20e18);
        assertEq(vault.totalDeposited(alice), 20e18);
        assertEq(vault.nextDepositId(), 1);
    }

    function test_deposit_revertsWhenPaused() public {
        vm.prank(ops);
        vault.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(BinaryDeposits.Paused.selector);
        vault.deposit(20e18);
    }

    function test_deposit_revertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(BinaryDeposits.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_deposit_revertsWithoutFunds() public {
        vm.prank(mallory); // no balance, no approval
        vm.expectRevert(BinaryDeposits.TransferFailed.selector);
        vault.deposit(1e18);
    }

    function test_payout_onlyToKnownDepositor() public {
        vm.prank(alice);
        vault.deposit(20e18);

        // mallory never deposited — cannot be a payout target
        vm.prank(ops);
        vm.expectRevert(BinaryDeposits.UnknownUser.selector);
        vault.payout(mallory, 5e18);

        // bridged-back winnings land in the vault before payout
        usdm.mint(address(vault), 5e18);

        vm.expectEmit(true, true, false, true);
        emit PaidOut(0, alice, 25e18);
        vm.prank(ops);
        vault.payout(alice, 25e18); // winnings may exceed deposits
        assertEq(usdm.balanceOf(alice), 1_000e18 - 20e18 + 25e18);
        assertEq(vault.totalPaidOut(alice), 25e18);
    }

    function test_payout_onlyOwner() public {
        vm.prank(alice);
        vault.deposit(20e18);
        vm.prank(mallory);
        vm.expectRevert(BinaryDeposits.NotOwner.selector);
        vault.payout(alice, 1e18);
    }

    function test_sweep() public {
        vm.prank(alice);
        vault.deposit(50e18);
        vm.prank(ops);
        vault.sweep(50e18);
        assertEq(usdm.balanceOf(treasury), 50e18);
        assertEq(usdm.balanceOf(address(vault)), 0);
    }

    function test_sweep_onlyOwner() public {
        vm.prank(alice);
        vault.deposit(50e18);
        vm.prank(mallory);
        vm.expectRevert(BinaryDeposits.NotOwner.selector);
        vault.sweep(50e18);
    }

    function test_adminSetters() public {
        address newTreasury = makeAddr("newTreasury");
        vm.startPrank(ops);
        vault.setTreasury(newTreasury);
        assertEq(vault.treasury(), newTreasury);
        vm.expectRevert(BinaryDeposits.ZeroAddress.selector);
        vault.setTreasury(address(0));
        vault.transferOwnership(alice);
        assertEq(vault.owner(), alice);
        vm.stopPrank();

        vm.prank(ops); // no longer owner
        vm.expectRevert(BinaryDeposits.NotOwner.selector);
        vault.setPaused(true);
    }

    function testFuzz_depositPayoutRoundTrip(uint96 amount) public {
        vm.assume(amount > 0);
        usdm.mint(alice, amount);
        vm.prank(alice);
        vault.deposit(amount);
        vm.prank(ops);
        vault.payout(alice, amount);
        assertEq(vault.totalDeposited(alice), amount);
        assertEq(vault.totalPaidOut(alice), amount);
    }
}
