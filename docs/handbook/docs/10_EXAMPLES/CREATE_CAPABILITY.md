# Create Capability

## Folder

A new capability should usually live near the feature domain that owns it. If the capability is primarily assistant logic, it belongs in the services layer; if it is a UI-facing feature, it should be introduced alongside the relevant page or component module.

## Manifest

Every capability should have a small manifest describing its name, description, inputs, outputs, and any provider or permission requirements. This makes it easier to register, discover, and document the feature.

## Workflow

1. Define the capability contract and expected output.
2. Implement the core execution path.
3. Connect it to the appropriate provider or local tool.
4. Expose it through the relevant interface or assistant tool surface.
5. Document the behavior and add tests.

## Tests

Tests should validate the happy path, the failure path, and any provider-specific branching. If the capability changes settings or persistent state, include a regression test for that path as well.
