import { DMMF } from '@prisma/photon/runtime'
import { ComputedInputs, MutationResolverParams } from '../utils'
import { getPhotonDmmf } from './utils'
import { DmmfDocument } from './DmmfDocument'
import { DmmfTypes } from './DmmfTypes'

export type TransformOptions = {
  globallyComputedInputs?: ComputedInputs
}

export const getTransformedDmmf = (
  photonClientPackagePath: string,
  options?: TransformOptions,
): DmmfDocument =>
  new DmmfDocument(transform(getPhotonDmmf(photonClientPackagePath), options))

const addDefaultOptions = (
  givenOptions?: TransformOptions,
): Required<TransformOptions> => ({
  globallyComputedInputs: {},
  ...givenOptions,
})

export function transform(
  document: DMMF.Document,
  options?: TransformOptions,
): DmmfTypes.Document {
  return {
    datamodel: transformDatamodel(document.datamodel),
    mappings: document.mappings as DmmfTypes.Mapping[],
    schema: transformSchema(document.schema, addDefaultOptions(options)),
  }
}

function transformDatamodel(datamodel: DMMF.Datamodel): DmmfTypes.Datamodel {
  return {
    enums: datamodel.enums,
    models: datamodel.models.map(model => ({
      ...model,
      fields: model.fields.map(field => ({
        ...field,
        kind: field.kind === 'object' ? 'relation' : field.kind,
      })),
    })),
  }
}

function transformSchema(
  schema: DMMF.Schema,
  { globallyComputedInputs }: Required<TransformOptions>,
): DmmfTypes.Schema {
  return {
    enums: schema.enums,
    inputTypes: schema.inputTypes.map(_ =>
      transformInputType(_, globallyComputedInputs),
    ),
    outputTypes: schema.outputTypes.map(o => ({
      ...o,
      fields: o.fields.map(f => ({
        ...f,
        args: f.args.map(transformArg),
        outputType: {
          ...f.outputType,
          type: getReturnTypeName(f.outputType.type),
        },
      })),
    })),
  }
}

/**
 * Conversion from a Photon arg type to a GraphQL arg type using
 * heuristics. A conversion is needed becuase GraphQL does not
 * support union types on args, but Photon does.
 */
function transformArg(arg: DMMF.SchemaArg): DmmfTypes.SchemaArg {
  // FIXME: *Enum*Filter are currently empty
  let inputType = arg.inputType.some(a => a.kind === 'enum')
    ? arg.inputType[0]
    : arg.inputType.find(a => a.kind === 'object')!

  if (!inputType) {
    inputType = arg.inputType[0]
  }

  return {
    name: arg.name,
    inputType: {
      ...inputType,
      type: getReturnTypeName(inputType.type),
    },
    // FIXME Why?
    isRelationFilter: undefined,
  }
}

type AddComputedInputParams = {
  inputType: DmmfTypes.InputType
  params: MutationResolverParams
  dmmf: DmmfDocument
  locallyComputedInputs: ComputedInputs
}

/** Resolver-level computed inputs aren't recursive so aren't
 *  needed for deep computed inputs.
 */
type AddDeepComputedInputsArgs = Omit<
  AddComputedInputParams,
  'locallyComputedInputs'
> & { data: any } // Used to recurse through the input object

/**
 * Recursively looks for inputs that need a value from globallyComputedInputs
 * and populates them
 */
function addGloballyComputedInputs({
  inputType,
  params,
  dmmf,
  data,
}: AddDeepComputedInputsArgs): Record<string, any> {
  if (Array.isArray(data)) {
    return data.map(value =>
      addGloballyComputedInputs({
        inputType,
        dmmf,
        params,
        data: value,
      }),
    )
  }
  // Get values for computedInputs corresponding to keys that exist in inputType
  const computedInputValues = Object.keys(inputType.computedInputs).reduce(
    (values, key) => ({
      ...values,
      [key]: inputType.computedInputs[key](params),
    }),
    {} as Record<string, any>,
  )
  // Combine computedInputValues with values provided by the user, recursing to add
  // global computedInputs to nested types
  return Object.keys(data).reduce((deeplyComputedData, fieldName) => {
    const field = inputType.fields.find(_ => _.name === fieldName)!
    const fieldValue =
      field.inputType.kind === 'object'
        ? addGloballyComputedInputs({
            inputType: dmmf.getInputType(field.inputType.type),
            dmmf,
            params,
            data: data[fieldName],
          })
        : data[fieldName]
    return {
      ...deeplyComputedData,
      [fieldName]: fieldValue,
    }
  }, computedInputValues)
}

export function addComputedInputs({
  dmmf,
  inputType,
  locallyComputedInputs,
  params,
}: AddComputedInputParams) {
  return {
    ...params.args,
    data: {
      /**
       * Globally computed inputs are attached to the inputType object
       * as 'computedInputs' by the transformInputType function.
       */
      ...addGloballyComputedInputs({
        inputType,
        dmmf,
        params,
        data: params.args.data,
      }),
      ...Object.keys(locallyComputedInputs).reduce(
        (args, key) => ({
          ...args,
          [key]: locallyComputedInputs[key](params),
        }),
        {} as Record<string, any>,
      ),
    },
  }
}

function transformInputType(
  inputType: DMMF.InputType,
  globallyComputedInputs: ComputedInputs,
): DmmfTypes.InputType {
  const fieldNames = inputType.fields.map(field => field.name)
  /**
   * Only global computed inputs are removed during schema transform.
   * Resolver level computed inputs are filtered as part of the
   * publishing process. They are then passed to addComputedInputs
   * at runtime so their values can be inferred alongside the
   * global values.
   */
  const globallyComputedInputsInType = Object.keys(
    globallyComputedInputs,
  ).reduce(
    (args, key) =>
      fieldNames.includes(key)
        ? { ...args, [key]: globallyComputedInputs[key] }
        : args,
    {} as ComputedInputs,
  )
  return {
    ...inputType,
    fields: inputType.fields
      .filter(field => !(field.name in globallyComputedInputs))
      .map(transformArg),
    computedInputs: globallyComputedInputsInType,
  }
}

/**
 * Make the "return type" property type always be a string. In Photon
 * it is allowed to be a nested structured object but we want only the
 * reference-by-name form.
 *
 */
//
// TODO _why_ is the dmmf like this?
//
// FIXME `any` type becuase this is used by both outputType and inputType
// and there is currently no generic capturing both ideas.
//
function getReturnTypeName(type: any) {
  if (typeof type === 'string') {
    return type
  }

  return type.name
}
