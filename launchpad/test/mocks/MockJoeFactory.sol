// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {MockJoePair} from "./MockJoePair.sol";
contract MockJoeFactory {
    mapping(bytes32 => address) internal _pairs;
    address public lastCreatedPair;
    function _key(address a, address b) internal pure returns (bytes32) { return keccak256(abi.encodePacked(a, b)); }
    function getPair(address a, address b) public view returns (address) { return _pairs[_key(a, b)]; }
    function createPair(address a, address b) external returns (address) {
        require(_pairs[_key(a, b)] == address(0), "exists");
        MockJoePair p = new MockJoePair();
        p.initPair(a, b);
        _pairs[_key(a, b)] = address(p);
        _pairs[_key(b, a)] = address(p);
        lastCreatedPair = address(p);
        return address(p);
    }
}
