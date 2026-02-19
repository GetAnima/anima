# Changelog

All notable changes to `@getanima/core` will be documented in this file.

## [0.6.2] - 2026-02-19
### Changed
- Comprehensive README overhaul — all features documented with code examples
- npmjs.com page now reflects full feature set

## [0.6.1] - 2026-02-19
### Added
- Integration tests for EpisodicMemory through main Anima class
- WakeContext now includes recentEpisodes
- 189 tests total

## [0.6.0] - 2026-02-18
### Added
- **EpisodicMemory** — session-based episode recording, consolidation, and querying
- Episodes wired into Anima class (`anima.episodes`)
- Recent episodes included in WakeContext during `boot()`

## [0.5.1] - 2026-02-18
### Added
- **BehavioralState** — decision tables, failure registries, hypothesis engine, behavioral params
- BehavioralState wired into Anima class (`anima.state`)
- State loaded during `boot()` and included in WakeContext
### Fixed
- Source audit: identity.ts, reflection.ts, signing.ts, anima.ts all clean

## [0.3.3] - 2026-02-18
### Fixed
- 10 new conflict detection tests (104 total)

## [0.3.2] - 2026-02-18
### Added
- **Conflict Detection** — `detectConflicts()`, `resolveConflict()`, `getConflicts()`
- File-based conflict persistence
- 94 tests passing

## [0.3.0] - 2026-02-18
### Added
- **RelationshipEngine** — `meet()`, `interact()`, `forget()`, `persist()`, `recent()`, `closest()`
- 69 tests passing

## [0.2.4] - 2026-02-18
### Added
- **Typed event system** — `on()`, `once()`, `off()`, `emit()` with AnimaEventMap
- Events wired into boot (afterWake), reflect (afterSleep), opine (opinionChanged)

## [0.2.3] - 2026-02-18
### Fixed
- Updated all getanima.dev references to getanima.net

## [0.2.2] - 2026-02-18
### Changed
- Trimmed package from 96 files/76KB to 51 files/43KB
- Excluded experimental modules from published tarball

## [0.2.1] - 2026-02-18
### Fixed
- `reflect()` — `startedAt` was computing duration instead of timestamp
- Excluded broken experimental modules from tsconfig build

## [0.2.0] - 2026-02-17
### Added
- Initial public release
- **MemoryEngine** — salience-scored memories with decay
- **IdentityManager** — voice calibration, drift detection
- **ReflectionEngine** — session summaries, checkpoints
- **SigningEngine** — Ed25519 identity signing and verification
- 51 tests passing
