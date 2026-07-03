// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {MockJoeFactory} from "./MockJoeFactory.sol";
import {MockWAVAX} from "./MockWAVAX.sol";
contract MockJoeRouter {
    MockJoeFactory public immutable joeFactory;
    MockWAVAX public immutable wavax;
    constructor() {
        joeFactory = new MockJoeFactory();
        wavax = new MockWAVAX();
    }
    function factory() external view returns (address) { return address(joeFactory); }
    function WAVAX() external view returns (address) { return address(wavax); }
}
