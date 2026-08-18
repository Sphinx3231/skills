// This project had no metro.config.js prior to ticket 016 — Expo's CLI
// falls back to expo/metro-config's default resolution/transform pipeline
// with no on-disk config file, and nothing before this ticket needed a
// customization. Adding this file is the minimal change needed to bundle
// react-native-fast-tflite's model asset: without `tflite` registered as a
// binary asset extension, Metro treats `require('.../food_classifier.tflite')`
// as a source module and tries (and fails) to parse the binary file as
// JS/JSON instead of returning an asset reference.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('tflite');

module.exports = config;
