package api

import (
	"regexp"
	"strconv"

	"github.com/stashapp/stash/internal/build"
	"github.com/stashapp/stash/pkg/logger"
)

// A fork build's commit hash never matches a release's, and its git-describe version looks
// like a development build. So fork builds always check the latest full release, and
// compare release numbers rather than hashes.
const forkFollowsReleases = true

var releaseNumberRE = regexp.MustCompile(`v(\d+)\.(\d+)\.(\d+)`)

// parseRelease finds the x.y.z in a version such as v0.32.0-8-gbb3bc063f.
func parseRelease(version string) ([3]int, bool) {
	var ret [3]int
	m := releaseNumberRE.FindStringSubmatch(version)
	if m == nil {
		return ret, false
	}
	for i := range ret {
		n, err := strconv.Atoi(m[i+1])
		if err != nil {
			return ret, false
		}
		ret[i] = n
	}
	return ret, true
}

// isNewerRelease reports whether latest is a later release than current. A version with
// no release number in it is never newer.
func isNewerRelease(current, latest string) bool {
	c, ok := parseRelease(current)
	if !ok {
		return false
	}
	l, ok := parseRelease(latest)
	if !ok {
		return false
	}
	for i := range c {
		if l[i] != c[i] {
			return l[i] > c[i]
		}
	}
	return false
}

func forkUpdateAvailable(latest string) bool {
	version, _, _ := build.Version()
	return isNewerRelease(version, latest)
}

// forkLogIfUpToDate logs when this build already includes the latest release, and reports
// whether it did.
func forkLogIfUpToDate(latest *LatestRelease) bool {
	version, _, _ := build.Version()
	if _, ok := parseRelease(version); !ok || forkUpdateAvailable(latest.Version) {
		return false
	}
	logger.Infof("This build (%s) already includes the latest release, %s", version, latest.Version)
	return true
}
