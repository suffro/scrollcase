/**
 * Browser-safe reference helpers for the Scrollcase contract.
 *
 * The rule for what belongs here is subtractive, so a new contract export has somewhere obvious to
 * go: this entry point carries everything `scrollcase/contract` does *except* what needs Node's
 * crypto to hash a payload, and except the two helpers that resolve a file beside the installed
 * package. Everything else in the contract — target identity, the runtime model, document naming,
 * the constants, the structural envelope guard — is a statement about names, and answers the same
 * in a browser, a Worker, or Node.
 *
 * The runtime model is here for that reason rather than by parity: `runtimes.mjs` reads no file,
 * joins no host path and starts no process, and a UI validating a box document has the same
 * questions to ask of it as the builder does.
 */

export {
  assertNativeHost,
  condaSubdir,
  pixiAccelerator,
  boxTargetAdapter,
  boxTargetAdapters,
  boxTargetId,
} from './targets.mjs';

export {
  RUNTIME_IDS,
  assertRuntimeEntryPoint,
  executionAffectingVariables,
  isExecutablePayloadPath,
  isImplementedRuntime,
  runtimeAdapter,
  runtimeAdapters,
  unimplementedRuntimeMessage,
} from './runtimes.mjs';

export {
  CHANNELS,
  DEFAULT_DOCUMENT_NAMESPACE,
  PAYLOAD_ENCODING,
  BOX_SCHEMA_VERSION,
  SIGNATURE_ALGORITHM,
  documentKinds,
  isSignedBoxDocument,
  parseDocumentKind,
} from './document-shape.mjs';
