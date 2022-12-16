MAKE_MAJOR_VER    := $(shell echo $(MAKE_VERSION) | cut -d'.' -f1)

ifneq ($(shell test $(MAKE_MAJOR_VER) -gt 3; echo $$?),0)
$(error Make version $(MAKE_VERSION) is not supported, please install GNU Make 4.x)
endif

AWK               ?= $(shell command -v gawk 2> /dev/null || command -v awk 2> /dev/null)

Q = $(if $(filter 1,$V),,@)
M = $(shell printf "\033[34;1m▶\033[0m")

# Use docker based commitsar if it isn't in the path
ifeq ($(COMMITSAR),)
	COMMITSAR = $(COMMITSAR_DOCKER)
endif

.PHONY: help
help:
	@grep --no-filename -E '^[ a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		$(AWK) 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-28s\033[0m %s\n", $$1, $$2}' | sort

.PHONY: test
test: ## Run all tests
	$Q $(CURDIR)/test.sh --type oss --unprivileged false --latest-njs false
