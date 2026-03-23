"""
Scan ELF IRAM/IROM segments for ESP32-C3 custom CSR instructions (CSR 0x7C0-0x7FF).
These are Espressif-specific CSRs (gpio_out_user, mexstatus, mnvec, etc.) that
Renode's rv32imc_zicsr CPU model does not implement — accessing them raises
'Illegal instruction', causing a panic loop.

For each found instruction, outputs a WriteDoubleWord .resc patch that replaces
the CSR read/write with: 'addi rd, x0, 0' (li rd, 0) to silently return 0.
"""
import struct

ELF_PATH = 'c:/git/renode-visual-console/submodules/esp-idf/examples/get-started/hello_world/build/hello_world.elf'

with open(ELF_PATH, 'rb') as f:
    data = f.read()

e_phoff = struct.unpack_from('<I', data, 28)[0]
e_phnum = struct.unpack_from('<H', data, 44)[0]

segments = []
for i in range(e_phnum):
    off = e_phoff + i * 32
    p_type, p_offset, p_vaddr, p_paddr, p_filesz, p_memsz = struct.unpack_from('<IIIIII', data, off)
    if p_type == 1:
        seg_data = data[p_offset:p_offset + p_filesz]
        segments.append((p_vaddr, seg_data, p_filesz))

def make_li_rd_0(rd):
    """'addi rd, x0, 0' — sets rd=0, 4 bytes."""
    return (0 << 20) | (0 << 15) | (0 << 12) | (rd << 7) | 0x13

NOP4 = 0x00000013  # addi x0, x0, 0

def decode_csr(word):
    funct3 = (word >> 12) & 0x7
    rd  = (word >> 7) & 0x1F
    rs1 = (word >> 15) & 0x1F
    csr = (word >> 20) & 0xFFF
    ops = {1:'csrrw', 2:'csrrs', 3:'csrrc', 5:'csrrwi', 6:'csrrsi', 7:'csrrci'}
    return ops.get(funct3, 'csr?'), rd, rs1, csr

patches = []

for (vaddr, seg_data, filesz) in segments:
    # Only IRAM (0x4037C000–0x403E0000) and IROM/flash (0x42000000–0x43000000)
    if not ((0x40380000 <= vaddr < 0x40400000) or (0x42000000 <= vaddr < 0x43000000)):
        continue

    region = 'IRAM' if vaddr < 0x42000000 else 'IROM'
    # Scan at every 2-byte alignment — RISC-V C-extension means 4-byte
    # instructions can sit at any 2-byte aligned offset (e.g., after a 2-byte
    # compressed instruction). Step by 2 to catch them all.
    for offset in range(0, filesz - 3, 2):
        word = struct.unpack_from('<I', seg_data, offset)[0]
        opcode = word & 0x7F
        if opcode != 0x73:
            continue
        funct3 = (word >> 12) & 0x7
        if funct3 == 0:  # ECALL/EBREAK/MRET etc.
            continue
        csr = (word >> 20) & 0xFFF
        if not (0x7C0 <= csr <= 0x7FF):
            continue

        addr = vaddr + offset
        op, rd, rs1, csr = decode_csr(word)
        repl = make_li_rd_0(rd) if rd != 0 else NOP4
        patches.append((region, addr, word, op, rd, rs1, csr, repl))

print(f"Found {len(patches)} custom CSR instructions (CSR 0x7C0–0x7FF):\n")
for region, addr, orig, op, rd, rs1, csr, repl in patches:
    print(f"  [{region}] 0x{addr:08x}: {orig:08x}  {op:6s} x{rd:02d}, CSR_0x{csr:03X}, x{rs1}")
    print(f"            -> sysbus WriteDoubleWord 0x{addr:08x} 0x{repl:08x}  # li x{rd}, 0")

print(f"\n# ── Paste into esp32c3.resc after sysbus LoadELF ────────────────────")
for region, addr, orig, op, rd, rs1, csr, repl in patches:
    print(f"sysbus WriteDoubleWord 0x{addr:08x} 0x{repl:08x}  # [{region}] {op} x{rd}, CSR_0x{csr:03X}")







