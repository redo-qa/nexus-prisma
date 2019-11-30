import * as Nexus from 'nexus'
import {
  generateSchemaAndTypes,
  generateSchemaAndTypesWithoutThrowing,
} from './__utils'

it('only publishes output types that do not map to prisma models', async () => {
  const datamodel = `
  model User {
    id  Int @id
    name String
  }
`
  const Query = Nexus.objectType({
    name: 'Query',
    definition(t: any) {
      t.crud.user()
    },
  })

  const Mutation = Nexus.objectType({
    name: 'Mutation',
    definition(t: any) {
      t.crud.updateManyUser({ filtering: true })
    },
  })

  const { missingTypes } = await generateSchemaAndTypesWithoutThrowing(
    datamodel,
    [Query, Mutation],
  )

  expect(Object.keys(missingTypes)).toEqual(['User'])
})

it('can get args from context', async () => {
  const datamodel = `
  model User {
    id  Int @id
    name String
    browser String
  }
`
  const Query = Nexus.objectType({
    name: 'Query',
    definition(t: any) {
      t.crud.user()
    },
  })

  const Mutation = Nexus.objectType({
    name: 'Mutation',
    definition(t: any) {
      t.crud.createOneUser({
        contextArgs: { browser: (ctx: any) => ctx.browser },
      })
    },
  })

  const User = Nexus.objectType({
    name: 'User',
    definition: (t: any) => {
      t.model.id()
      t.model.name()
      t.model.browser()
    },
  })

  const result = await generateSchemaAndTypesWithoutThrowing(datamodel, [
    Query,
    Mutation,
    User,
  ])
  expect(result).toMatchSnapshot('contextArgs')
})

it('can filter context args recursively', async () => {
  const datamodel = `
  model User {
    id  Int @id
    name String
    browser String
    nested Nested
  }

  model Nested {
    id Int @id
    browser String
  }
`
  const Query = Nexus.objectType({
    name: 'Query',
    definition(t: any) {
      t.crud.user()
    },
  })

  const Mutation = Nexus.objectType({
    name: 'Mutation',
    definition(t: any) {
      t.crud.createOneUser({
        contextArgs: { browser: (ctx: any) => ctx.browser },
      })
    },
  })

  const User = Nexus.objectType({
    name: 'User',
    definition: (t: any) => {
      t.model.id()
      t.model.name()
      t.model.nested()
      t.model.browser()
    },
  })

  const Nested = Nexus.objectType({
    name: 'Nested',
    definition: (t: any) => {
      t.model.id()
      t.model.browser()
    },
  })

  const result = await generateSchemaAndTypesWithoutThrowing(datamodel, [
    Query,
    Mutation,
    User,
    Nested,
  ])
  expect(result).toMatchSnapshot('recursiveContextArgs')
})

it('publishes scalars from input types', async () => {
  const datamodel = `
  model User {
    id  Int @id
    date DateTime
  }
  `

  const User = Nexus.objectType({
    name: 'User',
    definition(t: any) {
      t.model.id()
    },
  })

  const Query = Nexus.objectType({
    name: 'Query',
    definition(t: any) {
      t.crud.users({ filtering: true })
    },
  })

  const { schema, typegen } = await generateSchemaAndTypes(datamodel, [
    Query,
    User,
  ])

  expect(schema).toMatchSnapshot('schema')
  expect(typegen).toMatchSnapshot('typegen')
})
