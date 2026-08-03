import type {
  DataStoreMetadata,
  DataVersion,
  PublishedDataset,
  StoredValidationResult,
} from "../data-management-types";
import type { EnrollmentRecord } from "../types";

export interface DataVersionRepository {
  initialize(): Promise<void>;
  readMetadata(): Promise<DataStoreMetadata>;
  writeMetadata(metadata: DataStoreMetadata): Promise<void>;
  writeOriginal(internalFileName: string, bytes: Uint8Array): Promise<string>;
  readOriginal(relativePath: string): Promise<Uint8Array>;
  writeNormalized(versionId: string, records: EnrollmentRecord[]): Promise<string>;
  readNormalized(relativePath: string): Promise<EnrollmentRecord[]>;
  writeReport(
    versionId: string,
    report: StoredValidationResult,
  ): Promise<string>;
  writeSnapshot(snapshotId: string, dataset: PublishedDataset): Promise<void>;
  readSnapshot(snapshotId: string): Promise<PublishedDataset>;
  hasVersionFile(version: DataVersion): Promise<boolean>;
}
