package version

// Version is the platform version. It is overridden at build time with
// -ldflags "-X github.com/streamixs/factorio/apps/agent/internal/version.Version=vX.Y.Z".
var Version = "dev"
