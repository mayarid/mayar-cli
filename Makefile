.PHONY: help test version-patch version-minor version-major publish release-patch release-minor release-major

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  test            Run the test suite"
	@echo "  version-patch   Bump patch version (x.y.Z), commit & tag"
	@echo "  version-minor   Bump minor version (x.Y.0), commit & tag"
	@echo "  version-major   Bump major version (X.0.0), commit & tag"
	@echo "  publish         npm publish (current version)"
	@echo "  release-patch   test + version-patch + publish + git push"
	@echo "  release-minor   test + version-minor + publish + git push"
	@echo "  release-major   test + version-major + publish + git push"
	@echo ""
	@echo "  release-* runs the tests first. A failing test stops the release"
	@echo "  before the version bump. Follow the checklist in CHANGELOG.md."

test:
	npm test

# Read the new version in the same shell line as the commit and tag. A make
# $(eval ...) here would be expanded before `npm version` runs, and would tag
# the old version.
define bump
	npm version $(1) --no-git-tag-version
	git add package.json package-lock.json
	NEW_VERSION=$$(node -p "require('./package.json').version") && \
	  git commit -m "Release v$$NEW_VERSION" && \
	  git tag "v$$NEW_VERSION"
endef

version-patch:
	$(call bump,patch)

version-minor:
	$(call bump,minor)

version-major:
	$(call bump,major)

publish:
	npm publish --access public

release-patch: test version-patch publish
	git push origin main --tags

release-minor: test version-minor publish
	git push origin main --tags

release-major: test version-major publish
	git push origin main --tags
