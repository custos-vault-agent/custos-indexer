# abis

The ABI of each contract this indexer reads. `config.yaml` names the events it
wants and reads their signatures from these files, so a signature that changes in
a contract fails `envio codegen` here instead of producing a silent mismatch.

Copy a file again after a contract changes:

```bash
cp ../custos-contract/abi/CustosCore.json  abis/
cp ../custos-contract/abi/AgentVault.json  abis/
cp ../nansigil-contract/abi/NanSigil.json  abis/
```

`make abi` in each contract repository writes the originals.
