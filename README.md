<p align="center">
  <img src="https://andera.top/img/github.png" alt="Andera" style="max-width: 100%; height: auto;"/>
</p>

# Andera Worker Core

**Andera** is a high-performance, open-source Task Orchestration Platform (TOP) designed for simplicity, flexibility, and scalability.

---

## What is Andera?

Andera is composed of three main components:
- **Load Balancer:** Routes and prioritizes tasks, manages worker clusters, and provides a dashboard for monitoring.
- **Base Worker:** Template for building your own custom workers.
- **Worker Core:** The core engine for all workers.

Learn more: [Andera Documentation](https://andera.top/docs/)

---

## About Worker Core

Worker Core is the engine for all Andera-based workers.  
It is never used standalone, but always as a dependency of a Base Worker.  
It provides orchestration, slot management, contract validation, logging, and runtime for building high-performance, distributed workers.

---

## Features

- Slot orchestration and management
- Contract validation
- Logging and monitoring
- Runtime for distributed workers

See [Worker Core Documentation](https://andera.top/docs/worker-core/introduction/).

---

## Installation

Worker Core is not meant to be used directly.  
To use it, create a new worker using the [Base Worker template](https://andera.top/docs/base-worker/introduction/).

---

## Usage

See [Base Worker Usage](https://andera.top/docs/base-worker/usage/) for how to use Worker Core in your own worker. Worker Core is not tested directly. To verify that Worker Core is working correctly, test a Base Worker that depends on it:

1. Start your Base Worker (see its README for instructions).
2. Use the health check and function call endpoints as described in the [Base Worker Testing Guide](https://andera.top/docs/base-worker/test/).

If your Base Worker responds correctly, Worker Core is functioning as expected.

---

## Useful Links

- [Andera Documentation](https://andera.top/docs/)
- [Worker Core Reference](https://andera.top/docs/worker-core/)

---

## Contributing

Andera is open source and community-driven!
See [CONTRIBUTING.md](CONTRIBUTING.md) for repository guidelines, and [How to Contribute](https://andera.top/docs/contribute) for the project's philosophy and license.

---

## License

For license details, see the [LICENSE](LICENSE) file.