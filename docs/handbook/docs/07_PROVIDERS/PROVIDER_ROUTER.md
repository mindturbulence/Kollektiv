# Provider Router

## Routing Rules

The provider router should choose the best backend for the current task based on the requested modality, provider capability, and available credentials. The goal is to preserve a consistent user experience while allowing the app to use local or remote providers depending on the environment.

## Cost

Cost awareness matters even in a local-first product. Where practical, the router should prefer local execution or lower-cost models for simple tasks, then escalate to more capable providers only when the task requires it.

## Latency

Latency is a first-class product concern for assistant interactions and live workflows. Fast local or low-latency providers should be preferred when they can satisfy the request well enough.

## Fallback

Fallback is necessary because provider availability and credentials vary. A request should degrade gracefully from a preferred provider to a less preferred option instead of failing abruptly when the first path is unavailable.

## Current Routing Policy

The implementation favors a simple policy:

- use the configured active provider as the default path for assistant and prompt workflows
- switch providers only when the current provider is unsupported for the requested feature
- surface explicit errors when the provider is not configured or the feature is unsupported
- keep the provider decision at the service layer, not in the UI page components

This keeps the feature code stable while letting the provider layer adapt over time.
