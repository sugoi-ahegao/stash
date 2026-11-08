package api

import "testing"

func TestIsNewerRelease(t *testing.T) {
	tests := []struct {
		current, latest string
		want            bool
	}{
		{"v0.32.0-8-gbb3bc063f", "v0.32.0", false},
		{"v0.32.0-8-gbb3bc063f", "v0.32.1", true},
		{"v0.32.0-8-gbb3bc063f", "v0.33.0", true},
		{"v0.32.0-8-gbb3bc063f", "v1.0.0", true},
		{"v0.32.0-8-gbb3bc063f", "v0.31.1", false},
		{"v0.9.0-1-gabc", "v0.10.0", true},
		{"v0.32.0", "Stash v0.33.0", true},
		{"", "v0.33.0", false},
		{"bb3bc063f", "v0.33.0", false},
		{"v0.32.0-8-gbb3bc063f", "latest", false},
	}
	for _, tt := range tests {
		if got := isNewerRelease(tt.current, tt.latest); got != tt.want {
			t.Errorf("isNewerRelease(%q, %q) = %v, want %v", tt.current, tt.latest, got, tt.want)
		}
	}
}
