# Changelog

## [0.6.0](https://github.com/AstreliteHQ/localgrid.dev/compare/v0.5.0...v0.6.0) (2026-10-10)


### Features

* **overlay:** add an ephemeral tool to the dashboard with its current content ([#108](https://github.com/AstreliteHQ/localgrid.dev/issues/108)) ([6025de4](https://github.com/AstreliteHQ/localgrid.dev/commit/6025de4fa319bf746af67786858af09abfe8d23d))
* **png-optimizer:** add lossless PNG optimizer widget ([#91](https://github.com/AstreliteHQ/localgrid.dev/issues/91)) ([d8e8dd0](https://github.com/AstreliteHQ/localgrid.dev/commit/d8e8dd09de250f39d1524e2563641e242de8f466))
* **semver:** add SemVer checker widget ([#103](https://github.com/AstreliteHQ/localgrid.dev/issues/103)) ([005eed6](https://github.com/AstreliteHQ/localgrid.dev/commit/005eed6ffa0a012a6fa6cdc54cf479065ffb24b7))
* **widgets:** add Code Snippet widget ([#78](https://github.com/AstreliteHQ/localgrid.dev/issues/78)) ([c664757](https://github.com/AstreliteHQ/localgrid.dev/commit/c6647573fc87b15a840b8760c6364de963a934b1))
* **widgets:** add JSON Schema Validator widget ([#104](https://github.com/AstreliteHQ/localgrid.dev/issues/104)) ([d5ee0dc](https://github.com/AstreliteHQ/localgrid.dev/commit/d5ee0dcfa63d5b4e4284c0f6ecaee153209260bb))


### Bug Fixes

* **chart-generator:** keep data pane visible, add pie legend, make values clearable ([#101](https://github.com/AstreliteHQ/localgrid.dev/issues/101)) ([19dd420](https://github.com/AstreliteHQ/localgrid.dev/commit/19dd420d5c919577b84df3282f37a940e056c229))
* **command-palette:** search descriptions too, matching the sidebar ([#107](https://github.com/AstreliteHQ/localgrid.dev/issues/107)) ([689fe91](https://github.com/AstreliteHQ/localgrid.dev/commit/689fe916c1be70527d0c51fba5e5906de1939b55))
* **content-type-detector:** stop crashing on input LZ-String throws on ([#105](https://github.com/AstreliteHQ/localgrid.dev/issues/105)) ([49dbf99](https://github.com/AstreliteHQ/localgrid.dev/commit/49dbf990dabd2b51cfefeeaac73678f2233d8b4e))
* **world-clock:** keep city list visible in map mode and tint timeline hover ([#102](https://github.com/AstreliteHQ/localgrid.dev/issues/102)) ([1a0ef93](https://github.com/AstreliteHQ/localgrid.dev/commit/1a0ef939e0768940ef3e8c4621e9752a6d74db23))

## [0.5.0](https://github.com/AstreliteHQ/localgrid.dev/compare/v0.4.0...v0.5.0) (2026-10-03)


### Features

* **widgets:** add Chart Generator widget ([#54](https://github.com/AstreliteHQ/localgrid.dev/issues/54)) ([c39e744](https://github.com/AstreliteHQ/localgrid.dev/commit/c39e7441be41e8c50f042e14243a727f0cb2233a))
* **widgets:** add Merge PDFs widget ([#72](https://github.com/AstreliteHQ/localgrid.dev/issues/72)) ([710e458](https://github.com/AstreliteHQ/localgrid.dev/commit/710e4589ace5d39e7a97ad7c0fd0249b06aadbd2))
* **widgets:** add Split PDF widget ([#73](https://github.com/AstreliteHQ/localgrid.dev/issues/73)) ([ac74cfa](https://github.com/AstreliteHQ/localgrid.dev/commit/ac74cfa0c09077177e15b7e917c05afc0800aef2))
* **widgets:** add Watermark widget ([#75](https://github.com/AstreliteHQ/localgrid.dev/issues/75)) ([5490f31](https://github.com/AstreliteHQ/localgrid.dev/commit/5490f3121687d383ee2ca15806a12a7de56ee185))
* **world-clock:** add timeline view with one hour strip per city ([#77](https://github.com/AstreliteHQ/localgrid.dev/issues/77)) ([d9c0ca7](https://github.com/AstreliteHQ/localgrid.dev/commit/d9c0ca7a3c5b2bb57f5fe76e8ef33076fdec3197))


### Refactoring

* **pdf:** migrate PDF widgets from pdf-lib to @cantoo/pdf-lib ([#90](https://github.com/AstreliteHQ/localgrid.dev/issues/90)) ([955d44d](https://github.com/AstreliteHQ/localgrid.dev/commit/955d44dfbd29f384bead7f58aad022ea5ef40c65))

## [0.4.0](https://github.com/AstreliteHQ/localgrid.dev/compare/v0.3.0...v0.4.0) (2026-09-28)


### Features

* add clipboard features to image converter widget ([#60](https://github.com/AstreliteHQ/localgrid.dev/issues/60)) ([f3dd75b](https://github.com/AstreliteHQ/localgrid.dev/commit/f3dd75ba7477b5b89ce2381c1bfd98bd79be1150))
* **code-editor:** fill editor with dropped file text ([#74](https://github.com/AstreliteHQ/localgrid.dev/issues/74)) ([20babb6](https://github.com/AstreliteHQ/localgrid.dev/commit/20babb664c7364f7c18e8bcbac910996d896f31f))
* **dashboard:** add a Reset dashboard button ([#58](https://github.com/AstreliteHQ/localgrid.dev/issues/58)) ([6a14744](https://github.com/AstreliteHQ/localgrid.dev/commit/6a14744687d21cb4a1ec412042bef47771cce10f))
* **sidebar:** show the app version discreetly in the footer ([#57](https://github.com/AstreliteHQ/localgrid.dev/issues/57)) ([0f5e712](https://github.com/AstreliteHQ/localgrid.dev/commit/0f5e71259819559465b7a85b10f617294d309080))
* **widgets:** add image converter widget ([cb5a6a9](https://github.com/AstreliteHQ/localgrid.dev/commit/cb5a6a939c335d13f2fcd1edc610a0ffedd7304d))
* **widgets:** add Jinja Template Renderer widget ([#50](https://github.com/AstreliteHQ/localgrid.dev/issues/50)) ([0ff12c5](https://github.com/AstreliteHQ/localgrid.dev/commit/0ff12c56a20eaddf0b00b7b88b8bc63e7eb0ab64))


### Bug Fixes

* **header:** compact header actions on mobile ([#76](https://github.com/AstreliteHQ/localgrid.dev/issues/76)) ([cd14193](https://github.com/AstreliteHQ/localgrid.dev/commit/cd141935c7f0c3ae2926dd0000619d466c32c4ca))
* **image-converter:** address review findings ([a8e5df3](https://github.com/AstreliteHQ/localgrid.dev/commit/a8e5df3079a2e6d012280084748001ab324656fb))
* **image-converter:** include detected format in accessible label ([f2a0cb8](https://github.com/AstreliteHQ/localgrid.dev/commit/f2a0cb8b506e5eea35322375a897f3e9c1cc7463))

## [0.3.0](https://github.com/AstreliteHQ/localgrid.dev/compare/v0.2.2...v0.3.0) (2026-09-21)


### Features

* add qr code generator widget ([#40](https://github.com/AstreliteHQ/localgrid.dev/issues/40)) ([6b68225](https://github.com/AstreliteHQ/localgrid.dev/commit/6b682256b6a643015e7a7192fdab55a3d64c19f4))
* add searchable world clock combobox ([07517c2](https://github.com/AstreliteHQ/localgrid.dev/commit/07517c261044fc2684701be1292eadaa31c71549))
* **widgets:** add big-o estimator widget ([#43](https://github.com/AstreliteHQ/localgrid.dev/issues/43)) ([fb1e078](https://github.com/AstreliteHQ/localgrid.dev/commit/fb1e078ced9abffa31fd24dbdf2e8668ac07f6af))
* **widgets:** add curl command builder widget ([#48](https://github.com/AstreliteHQ/localgrid.dev/issues/48)) ([55b83e9](https://github.com/AstreliteHQ/localgrid.dev/commit/55b83e9a4a049fee0a000772b6865342c9b99c1d))
* **widgets:** add duplicate remover widget ([#42](https://github.com/AstreliteHQ/localgrid.dev/issues/42)) ([5fa2cfc](https://github.com/AstreliteHQ/localgrid.dev/commit/5fa2cfc75f1ed77a61bfa1efb2ebc3f806906f80))
* **widgets:** add Time Zone Calculator widget ([#49](https://github.com/AstreliteHQ/localgrid.dev/issues/49)) ([1008cc6](https://github.com/AstreliteHQ/localgrid.dev/commit/1008cc61ca08e1a9ffa6beaa1d5f9342270726f7))

## [0.2.2](https://github.com/AstreliteHQ/localgrid.dev/compare/v0.2.1...v0.2.2) (2026-09-11)


### Bug Fixes

* widget dropped from sidebar incorrectly placed ([72abd89](https://github.com/AstreliteHQ/localgrid.dev/commit/72abd897297cf38d2b2ec03ae6fa81518c1ba21a))

## [0.2.1](https://github.com/AstreliteHQ/localgrid.dev/compare/v0.2.0...v0.2.1) (2026-09-10)


### Bug Fixes

* allow configurable vite path and publish npm package ([#33](https://github.com/AstreliteHQ/localgrid.dev/issues/33)) ([9715585](https://github.com/AstreliteHQ/localgrid.dev/commit/97155856ca0145c08931635a79acf5742cedb032))

## [0.2.0](https://github.com/DropSnorz/localgrid.dev/compare/v0.1.0...v0.2.0) (2026-09-09)


### Features

* add Certificate Viewer widget ([#10](https://github.com/DropSnorz/localgrid.dev/issues/10)) ([cadc6ea](https://github.com/DropSnorz/localgrid.dev/commit/cadc6eab3fd0739eb72db01df975d599dd3137f6))
* add code mirror code editor component ([9fb7e19](https://github.com/DropSnorz/localgrid.dev/commit/9fb7e19673c68d684ecd9adf0dd540e9d1808cc6))
* add color picker components ([#12](https://github.com/DropSnorz/localgrid.dev/issues/12)) ([94e8e2a](https://github.com/DropSnorz/localgrid.dev/commit/94e8e2a81716eb17b7e6dbfd1988e3c5479e91e1))
* add content type detector widget ([#15](https://github.com/DropSnorz/localgrid.dev/issues/15)) ([bc40a1f](https://github.com/DropSnorz/localgrid.dev/commit/bc40a1f4ed2a654a71f1803a90a462658d5bdec8))
* add Cron widget with plain-English description and next-trigger preview ([2788e70](https://github.com/DropSnorz/localgrid.dev/commit/2788e705363ab937039e86c7efbcebfe4183fcae))
* add Cron widget with plain-English description and next-trigger preview ([8302b2d](https://github.com/DropSnorz/localgrid.dev/commit/8302b2da267997a7962ba481319694171cefa697))
* add dashboard tabs and missing widget unit tests ([5b6461a](https://github.com/DropSnorz/localgrid.dev/commit/5b6461aed2b8cc43137cd84f7b20dec79e104fab))
* add emoji picker widget ([d75a026](https://github.com/DropSnorz/localgrid.dev/commit/d75a026c5e7d03eb5207d207018a83e39d5c1ecc))
* add inivisible character cleaner and token counter widgets ([#19](https://github.com/DropSnorz/localgrid.dev/issues/19)) ([3270349](https://github.com/DropSnorz/localgrid.dev/commit/32703490d979c166bd17ef6a85efd580f07d82dd))
* add JWK Viewer widget ([#11](https://github.com/DropSnorz/localgrid.dev/issues/11)) ([e2d8b36](https://github.com/DropSnorz/localgrid.dev/commit/e2d8b36e28fd51e93ef1ef0dea24ed7e04a3b8f1))
* add log viewer widget ([#20](https://github.com/DropSnorz/localgrid.dev/issues/20)) ([21bd059](https://github.com/DropSnorz/localgrid.dev/commit/21bd059e3e6d3d785a8595fc41d40a32b9d4dc7d))
* add lz-string widget and update share dashbaord schema ([36f90eb](https://github.com/DropSnorz/localgrid.dev/commit/36f90eb62e5a5053897535bd9f3af594eab633ad))
* add Math category with five widgets ([#5](https://github.com/DropSnorz/localgrid.dev/issues/5)) ([a105e90](https://github.com/DropSnorz/localgrid.dev/commit/a105e90a0b347828b6e2e931403a5d46fb2a483f))
* add Notes widget with a collapsible text statistics panel ([35f4849](https://github.com/DropSnorz/localgrid.dev/commit/35f484903ea1cad97cdbe72efed5f066b505ef53))
* add Password Generator widget ([#8](https://github.com/DropSnorz/localgrid.dev/issues/8)) ([abf4244](https://github.com/DropSnorz/localgrid.dev/commit/abf42447d4efe63903f10192dd1a85c166bc0d50))
* add Text Diff widget ([913626f](https://github.com/DropSnorz/localgrid.dev/commit/913626f9c930751dbf9df676ef88fe5b3a5c1657))
* add Timer widget with clock, stopwatch, and countdown ([#14](https://github.com/DropSnorz/localgrid.dev/issues/14)) ([367fcec](https://github.com/DropSnorz/localgrid.dev/commit/367fcecfb8136eff8c40769964e0f5090a55f4ad))
* add WCAG contrast checker widget ([#13](https://github.com/DropSnorz/localgrid.dev/issues/13)) ([1a587cd](https://github.com/DropSnorz/localgrid.dev/commit/1a587cd2f87eda15d7491e920724abd2e87c072a))
* add widget sidebar filter ([63799fa](https://github.com/DropSnorz/localgrid.dev/commit/63799fabc47f3b6adb26783a2a2bde9fecf7c4fd))
* add XML formatter widget ([#22](https://github.com/DropSnorz/localgrid.dev/issues/22)) ([914278e](https://github.com/DropSnorz/localgrid.dev/commit/914278ef06b25e409c36ceb7a269b65cc091b624))
* add YAML ↔ JSON converter widget ([#16](https://github.com/DropSnorz/localgrid.dev/issues/16)) ([547c132](https://github.com/DropSnorz/localgrid.dev/commit/547c1323ca513f175c27870cd69198ddf2a561dd))
* **cron:** animate a relative countdown progress bar per trigger ([a86c82f](https://github.com/DropSnorz/localgrid.dev/commit/a86c82ff06853333413cfdb6844b45ee84d7dd41))
* improve text diff widget for large diff display ([bb358fa](https://github.com/DropSnorz/localgrid.dev/commit/bb358fa97cab51cb88b07e28837282f611297671))
* **widget:** add timeline widget for debugging event order ([#28](https://github.com/DropSnorz/localgrid.dev/issues/28)) ([071ce01](https://github.com/DropSnorz/localgrid.dev/commit/071ce01bb9c981fb5dd1418769994b8c2aa8431a))
* **widget:** add World Clock / timezone converter widget ([#23](https://github.com/DropSnorz/localgrid.dev/issues/23)) ([1e102f6](https://github.com/DropSnorz/localgrid.dev/commit/1e102f627c2f40a9127267362d65bcb8dd952b64))
* **widget:** interactive JSON/XML tree viewer with stats and field hints ([#26](https://github.com/DropSnorz/localgrid.dev/issues/26)) ([8472908](https://github.com/DropSnorz/localgrid.dev/commit/8472908c4aec58fca1a37d0f7dc4ec0b27ad023a))


### Bug Fixes

* improve display and prevent widget close on drag ([#31](https://github.com/DropSnorz/localgrid.dev/issues/31)) ([e2208b7](https://github.com/DropSnorz/localgrid.dev/commit/e2208b7467ecc3f8a0b0df0c5281e4efb8a47e2f))
* minor display and reactive fixes ([1a4495b](https://github.com/DropSnorz/localgrid.dev/commit/1a4495b7b9da55c2dfcd7acd8eef9027173010f8))
