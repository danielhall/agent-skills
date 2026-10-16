---
name: dotnet-solution-setup
description: Sets up and maintains .NET solutions with a consistent layout, covering global.json, Directory.Build.props, central package management, .slnx, .editorconfig, Clean Architecture layering and test projects. Use when creating a new .NET or ASP.NET Core solution, adding a project or NuGet package to one, restructuring a .NET repo, or setting up .NET tests.
---

# .NET solution setup

These conventions apply to every .NET solution. If an existing repo already does something differently on purpose (it's written down in its docs or `CLAUDE.md`), follow the repo.

## Root files

Every solution has these at its root.

**`global.json`** pins the SDK so builds are reproducible, while allowing newer patches and feature bands:

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
```

**`Directory.Build.props`** holds settings shared by every project, so individual `.csproj` files stay short:

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
  </PropertyGroup>
</Project>
```

Don't repeat these properties in individual `.csproj` files.

**`Directory.Packages.props`** turns on central package management. Package versions live here and nowhere else:

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="Microsoft.EntityFrameworkCore" Version="10.0.4" />
  </ItemGroup>
  <ItemGroup Label="Tests">
    <PackageVersion Include="xunit" Version="2.9.3" />
  </ItemGroup>
</Project>
```

- In `.csproj` files, write `<PackageReference Include="..." />` with no `Version`.
- Keep test packages in their own `ItemGroup`.
- When pinning a transitive package to get past a vulnerability, add a one-line comment with the advisory ID.
- If several packages share a version (all the `Microsoft.EntityFrameworkCore.*` packages, say), put it in a property such as `$(EfCoreVersion)`.

**`.editorconfig`** sets the code style. Use file-scoped namespaces. Keep most style rules at `suggestion` severity: with `TreatWarningsAsErrors` on, a style rule at `warning` turns a formatting slip into a broken build. Raise individual rules deliberately, not all at once.

**The solution file** is `.slnx`, which is the default from .NET 10 (`dotnet new sln`). Convert an old `.sln` with `dotnet sln <name>.sln migrate`, then delete the `.sln`.

## Project layout

```
src/
  <Name>.Domain/          # entities, value objects, domain events; no dependencies
  <Name>.Application/     # use cases, interfaces (ports), validation; depends on Domain
  <Name>.Infrastructure/  # EF Core, external APIs, file storage; implements Application's interfaces
  <Name>.Api/             # ASP.NET Core host, endpoints, DI wiring
tests/
  <Name>.Domain.UnitTests/
  <Name>.Application.UnitTests/
  <Name>.Infrastructure.UnitTests/
  <Name>.Api.IntegrationTests/
```

- Dependencies point inwards only: Api depends on Application and Infrastructure, Infrastructure on Application, and Application on Domain. Domain depends on nothing.
- A small console app or game doesn't need four layers. Use this layout for web APIs and anything with a database, and keep simpler projects simple.
- Each layer exposes one `DependencyInjection.cs` with an `AddXxxServices()` extension method, so `Program.cs` reads as a short list of calls.

## Patterns

- **Minimal APIs**, grouped by feature, under a versioned base path (`/api/v1/...`).
- **Expected failures return a `Result`** (not found, validation, conflict), and the endpoint maps it to an HTTP response. Exceptions are for unexpected failures, handled by one global `IExceptionHandler` that returns ProblemDetails.
- **`TimeProvider`** for the current time, registered as a singleton. Never call `DateTime.Now` or `DateTime.UtcNow` in domain or application code.
- **Guard clauses** with the built-in throw helpers (`ArgumentNullException.ThrowIfNull`, `ArgumentException.ThrowIfNullOrEmpty`) before reaching for a package.

## Packages

- Ask before adding a NuGet package.
- MediatR and AutoMapper moved to commercial licences for recent versions. Check the current terms before adding either. A small hand-written dispatcher, calling handlers directly, or a source generator such as Mapperly usually covers the need.
- FluentValidation, Testcontainers, Respawn and Shouldly are free to use.

## Tests

- **xUnit** is the default. Use one test framework per solution. If the solution already uses NUnit or MSTest, keep using it rather than mixing.
- One test project per layer, named `<Project>.UnitTests` or `<Project>.IntegrationTests`.
- Domain tests are pure and fast, with no database and no HTTP.
- Integration tests run the real API in-process with `WebApplicationFactory<Program>` against a real database from Testcontainers, and reset state between tests with Respawn. Add `public partial class Program;` to the API's `Program.cs` so the tests can reference it.
- Prefer a real database over mocks for anything that depends on query behaviour.
- Tests that need Docker must be easy to leave out:

```bash
dotnet test --filter "FullyQualifiedName!~IntegrationTests"
```

## Before committing

```bash
dotnet build    # must finish with zero warnings
dotnet test
```

## New solution checklist

1. `dotnet new globaljson --sdk-version <version> --roll-forward latestFeature`
2. `dotnet new sln -n <Name>`
3. Add `Directory.Build.props`, `Directory.Packages.props` and `.editorconfig` as above.
4. Create the `src/` and `tests/` projects and add them with `dotnet sln add`.
5. Add the project references so dependencies point inwards.
6. Check that `dotnet build` and `dotnet test` both pass cleanly.
