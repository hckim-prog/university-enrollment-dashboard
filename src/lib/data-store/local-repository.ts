import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  DataStoreMetadata,
  DataVersion,
  PublishedDataset,
  StoredValidationResult,
} from "../data-management-types";
import type { EnrollmentRecord } from "../types";
import type { DataVersionRepository } from "./repository";

const EMPTY_METADATA: DataStoreMetadata = {
  schemaVersion: 1,
  activeSnapshotId: null,
  activeByYear: {},
  versions: [],
  audit: [],
  updatedAt: new Date(0).toISOString(),
};

export function defaultLocalStoreRoot() {
  return process.env.LOCAL_DATA_STORE_DIR
    ? path.resolve(process.env.LOCAL_DATA_STORE_DIR)
    : path.join(process.cwd(), "data", "local-store");
}

export class LocalDataVersionRepository implements DataVersionRepository {
  constructor(private readonly root = defaultLocalStoreRoot()) {}

  private resolveRelative(relativePath: string) {
    const target = path.resolve(this.root, relativePath);
    const relative = path.relative(this.root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("invalid_storage_path");
    }
    return target;
  }

  private async atomicWrite(relativePath: string, content: string | Uint8Array) {
    const target = this.resolveRelative(relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, target);
  }

  async initialize() {
    await Promise.all(
      ["originals", "normalized", "reports", "snapshots", "staging", "metadata"].map(
        (directory) => mkdir(this.resolveRelative(directory), { recursive: true }),
      ),
    );
    try {
      const entries = await readdir(this.resolveRelative("metadata"));
      if (entries.some((entry) => entry.endsWith(".json"))) return;
    } catch {}
    await this.writeMetadata(EMPTY_METADATA);
  }

  async readMetadata() {
    await this.initialize();
    const entries = (await readdir(this.resolveRelative("metadata")))
      .filter((entry) => entry.endsWith(".json"))
      .toSorted()
      .reverse();
    if (!entries.length) return { ...EMPTY_METADATA };
    return JSON.parse(
      await readFile(
        this.resolveRelative(path.posix.join("metadata", entries[0])),
        "utf8",
      ),
    ) as DataStoreMetadata;
  }

  async writeMetadata(metadata: DataStoreMetadata) {
    const order = (
      BigInt(Date.now()) * BigInt(1_000_000) +
      (process.hrtime.bigint() % BigInt(1_000_000))
    )
      .toString()
      .padStart(22, "0");
    await this.atomicWrite(
      path.posix.join(
        "metadata",
        `${order}-${randomUUID()}.json`,
      ),
      JSON.stringify(metadata, null, 2),
    );
  }

  async writeOriginal(internalFileName: string, bytes: Uint8Array) {
    const relativePath = path.posix.join("originals", internalFileName);
    await this.atomicWrite(relativePath, bytes);
    return relativePath;
  }

  async readOriginal(relativePath: string) {
    return new Uint8Array(await readFile(this.resolveRelative(relativePath)));
  }

  async writeNormalized(versionId: string, records: EnrollmentRecord[]) {
    const relativePath = path.posix.join("normalized", `${versionId}.json`);
    await this.atomicWrite(relativePath, JSON.stringify(records));
    return relativePath;
  }

  async readNormalized(relativePath: string) {
    return JSON.parse(
      await readFile(this.resolveRelative(relativePath), "utf8"),
    ) as EnrollmentRecord[];
  }

  async writeReport(versionId: string, report: StoredValidationResult) {
    const relativePath = path.posix.join(
      "reports",
      `${versionId}-${randomUUID()}.json`,
    );
    await this.atomicWrite(relativePath, JSON.stringify(report, null, 2));
    return relativePath;
  }

  async writeSnapshot(snapshotId: string, dataset: PublishedDataset) {
    await this.atomicWrite(
      path.posix.join("snapshots", `${snapshotId}.json`),
      JSON.stringify(dataset),
    );
  }

  async readSnapshot(snapshotId: string) {
    return JSON.parse(
      await readFile(
        this.resolveRelative(path.posix.join("snapshots", `${snapshotId}.json`)),
        "utf8",
      ),
    ) as PublishedDataset;
  }

  async hasVersionFile(version: DataVersion) {
    try {
      await Promise.all([
        access(this.resolveRelative(version.storagePath)),
        version.normalizedPath
          ? access(this.resolveRelative(version.normalizedPath))
          : Promise.resolve(),
        access(this.resolveRelative(version.reportPath)),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}
