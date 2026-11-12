# ACL Custom Agent Creator (`acl-custom-agent-creator`)

The `acl-custom-agent-creator` skill guides developers through an interactive 5-stage elicitation workflow to design, verify, and scaffold custom agents that integrate seamlessly into the ACL-ADLC agile software delivery lifecycle.

## Features
- **5-Stage Interactive Elicitation**: Extracts agent identity, responsibilities, output archetype, and menu actions.
- **ACL-ADLC Workflow Verification**: Checks phase alignment (Phase 1 Analysis, Phase 2 Planning, Phase 3 Solutioning, Phase 4 Implementation, or Cross-cutting) and upstream prerequisite document requirements.
- **Phase-Gate Governance**: Enforces Manager sign-off invariants (`status: In Review` on generation -> Manager `Approved` in Markdown Studio before downstream execution).
- **Archetype Scaffolding**: Pre-packaged templates for Markdown File Creators, Code Reviewers, and Code Generators.
- **Roster Registration**: Generates configuration snippets for `_acl/custom/config.toml` to register agents into the ACL multi-agent ecosystem.
